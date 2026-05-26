const DB_NAME = 'BauerProductionDB';
const DB_VERSION = 2; // Bumped version for master data

class ProductionDB {
    constructor() {
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject('Erro ao abrir banco de dados');
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store for production scans
                if (!db.objectStoreNames.contains('scans')) {
                    db.createObjectStore('scans', { keyPath: 'id', autoIncrement: true });
                }

                // Store for active session data
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // [NEW] Store for Master Orders (OM -> Item relationship)
                if (!db.objectStoreNames.contains('masterOrders')) {
                    db.createObjectStore('masterOrders', { keyPath: 'om' });
                }

                // [NEW] Store for Master Routings (Item -> Operations relationship)
                if (!db.objectStoreNames.contains('masterRoutings')) {
                    const store = db.createObjectStore('masterRoutings', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('itemCode', 'itemCode', { unique: false });
                }
            };
        });
    }

    async saveScan(scanData) {
        return this._perform('scans', 'readwrite', (store) => store.add(scanData));
    }

    async getScans() {
        return this._perform('scans', 'readonly', (store) => store.getAll());
    }

    async clearScans() {
        return this._perform('scans', 'readwrite', (store) => store.clear());
    }

    async updateScan(id, updatedData) {
        return this._perform('scans', 'readwrite', (store) => store.put({ ...updatedData, id: parseInt(id) }));
    }

    // --- Master Data Methods ---

    async saveMasterData(orders, routings) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['masterOrders', 'masterRoutings'], 'readwrite');
            const ordersStore = transaction.objectStore('masterOrders');
            const routingsStore = transaction.objectStore('masterRoutings');

            // Clear old data first
            ordersStore.clear();
            routingsStore.clear();

            // Add new data
            orders.forEach(o => ordersStore.add(o));
            routings.forEach(r => routingsStore.add(r));

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getMasterOrder(om) {
        if (!om) return null;
        const cleanOM = om.toString().replace(/^0+/, '') || '0';
        // 1. Tenta buscar pelo código limpo (padrão novo)
        let order = await this._perform('masterOrders', 'readonly', (store) => store.get(cleanOM));
        
        // 2. Se não achar, tenta buscar pelo código original (padrão antigo)
        if (!order && om.toString() !== cleanOM) {
            order = await this._perform('masterOrders', 'readonly', (store) => store.get(om.toString()));
        }
        
        return order;
    }

    async getMasterRoutings(itemCode) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction('masterRoutings', 'readonly');
            const store = transaction.objectStore('masterRoutings');
            const index = store.index('itemCode');
            const request = index.getAll(itemCode);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async validateSequence(om, serial, currentOp, itemCode) {
        const allScans = await this.getScans();

        // 0. Verificar se JÁ FOI APONTADO NESTA OPERAÇÃO (Trava de Duplicidade)
        const hasCurrent = allScans.some(s => {
            const sOM = s.om.toString().trim().replace(/^0+/, '') || '0';
            const sSerial = s.serial.toString().trim().replace(/^0+/, '') || '0';
            const sOp = s.operacao.toString().trim();
            
            const targetOM = om.toString().trim().replace(/^0+/, '') || '0';
            const targetSerial = serial.toString().trim().replace(/^0+/, '') || '0';
            const targetOp = currentOp.toString().trim();

            return sOM === targetOM && sSerial === targetSerial && sOp === targetOp;
        });
        if (hasCurrent) {
            return { 
                valid: false, 
                type: 'duplicate',
                error: `Este serial (${serial}) já foi registrado para esta operação.` 
            };
        }

        const routings = await this.getMasterRoutings(itemCode.toString().trim());
        if (!routings || routings.length === 0) return { valid: true };

        const filteredRoutings = routings
            .filter(r => {
                const op = r.operacao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return !op.includes('TESTE') && !op.includes('DISTRIBUICAO');
            })
            .sort((a, b) => a.sequencia - b.sequencia);
        const currentIndex = filteredRoutings.findIndex(r => r.operacao === currentOp);
        
        if (currentIndex <= 0) return { valid: true };

        const prevOp = filteredRoutings[currentIndex - 1].operacao;
        
        const hasPrev = allScans.some(s => 
            s.om.toString() === om.toString() && 
            s.serial.toString() === serial.toString() && 
            s.operacao === prevOp
        );

        if (!hasPrev) {
            return { valid: false, error: `Sequência incorreta: O serial deve passar primeiro pela operação ${prevOp}.` };
        }

        return { valid: true };
    }

    async checkQuantityLimit(om, currentOp) {
        const order = await this.getMasterOrder(om);
        if (!order) return { valid: true };

        const allScans = await this.getScans();
        // Filtra scans desta OM e desta Operação (ignora o serial, pois queremos a contagem total de peças que passaram por aqui)
        const targetOM = om.toString().trim().replace(/^0+/, '') || '0';
        const targetOp = currentOp.toString().trim();

        const opScans = allScans.filter(s => {
            const sOM = s.om.toString().trim().replace(/^0+/, '') || '0';
            const sOp = s.operacao.toString().trim();
            return sOM === targetOM && sOp === targetOp;
        });

        if (opScans.length >= order.quantidade) {
            return { valid: false, error: `Limite de quantidade (${order.quantidade}) atingido para esta operação.` };
        }

        return { valid: true };
    }

    _perform(storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = operation(store);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

window.db = new ProductionDB();
