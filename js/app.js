const state = {
    activeOperator: null,
    activeOM: null,
    activeOperation: null,
    // Produção
    currentSerial: null,
    startTime: null,
    timerInterval: null,
    elapsedSeconds: 0,
    pauseSeconds: 0,
    isPaused: false,
    realizedCount: 0,
    totalPlanned: 0,
    unitStartTime: null,
    currentPauseReason: null,
    history: []
};

// Utilities
const sanitizeCode = (code) => {
    if (!code) return '';
    return code.toString().trim().replace(/^0+/, '') || '0';
};

// DOM Elements
const screens = {
    login: document.getElementById('screen-login'),
    setup: document.getElementById('screen-setup'),
    production: document.getElementById('screen-production'),
    admin: document.getElementById('screen-admin')
};

const inputs = {
    operatorId: document.getElementById('operator-id'),
    omId: document.getElementById('om-id'),
    operation: document.getElementById('operation-select'),
    currentSerial: document.getElementById('current-serial'),
    unitTimer: document.getElementById('unit-timer'),
    progressText: document.getElementById('prod-progress-text'),
    progressBar: document.getElementById('prod-progress-bar'),
    historyContainer: document.getElementById('production-history')
};

const buttons = {
    login: document.getElementById('btn-login'),
    start: document.getElementById('btn-start-production'),
    backLogin: document.getElementById('btn-back-login'),
    finishUnit: document.getElementById('btn-finish-unit'),
    pause: document.getElementById('btn-pause'),
    forceFinish: document.getElementById('btn-force-finish')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.db.init();
        console.log('DB Initialized');
        renderOpenOrders();
    } catch (e) {
        console.error(e);
    }
    
    setupEventListeners();
    showScreen('login');
});

function setupEventListeners() {
    // Numpad Logic
    document.querySelectorAll('.num-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            inputs.operatorId.value += btn.textContent;
            inputs.operatorId.focus();
        });
    });

    // Login Action
    buttons.login.addEventListener('click', handleLogin);
    inputs.operatorId.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Login Actions
    buttons.login.addEventListener('click', handleLogin);

    // Back Action
    buttons.backLogin.addEventListener('click', () => {
        state.activeOperator = null;
        showScreen('login');
        inputs.operatorId.value = '';
        setTimeout(() => inputs.operatorId.focus(), 100);
    });

    // OM Validation & Scanner Bip (Enter key from scanner)
    inputs.omId.addEventListener('input', validateSetup);
    inputs.omId.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            validateSetup();
            if (!buttons.start.disabled) {
                buttons.start.click();
            }
        }
    });

    inputs.operation.addEventListener('change', validateSetup);

    // Setup Actions handled via showScreen logic

    // File Upload Scanning for Testing
    const setupFileInput = document.getElementById('setup-file-input');
    const prodFileInput = document.getElementById('prod-file-input');

    const loginFileInput = document.createElement('input');
    loginFileInput.type = 'file';
    loginFileInput.accept = 'image/*';
    loginFileInput.style.display = 'none';
    document.body.appendChild(loginFileInput);

    document.getElementById('btn-upload-login').addEventListener('click', () => loginFileInput.click());
    document.getElementById('btn-upload-om').addEventListener('click', () => setupFileInput.click());
    document.getElementById('btn-upload-test').addEventListener('click', () => prodFileInput.click());

    loginFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await window.scanner.scanFile(e.target.files[0], (code) => {
                inputs.operatorId.value = code;
                handleLogin();
            });
            e.target.value = '';
        }
    });

    setupFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await window.scanner.scanFile(e.target.files[0], (code) => {
                inputs.omId.value = sanitizeCode(code);
                validateSetup();
            });
            e.target.value = ''; // Reset for next use
        }
    });

    prodFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await window.scanner.scanFile(e.target.files[0], handleBarcodeScan);
            e.target.value = ''; // Reset
        }
    });

    // Admin Screen Logic
    const passwordModal = document.getElementById('password-modal');
    const adminPasswordInput = document.getElementById('admin-password');
    const passwordError = document.getElementById('password-error');

    document.getElementById('btn-goto-admin').addEventListener('click', () => {
        passwordModal.style.display = 'flex';
        adminPasswordInput.value = '';
        passwordError.style.display = 'none';
        setTimeout(() => adminPasswordInput.focus(), 100);
    });

    document.getElementById('btn-cancel-password').addEventListener('click', () => {
        passwordModal.style.display = 'none';
    });

    document.getElementById('btn-confirm-password').addEventListener('click', handleAdminAuth);
    adminPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminAuth();
    });

    function handleAdminAuth() {
        if (adminPasswordInput.value === 'PCP2000') {
            passwordModal.style.display = 'none';
            showScreen('admin');
            renderAdminScans();
        } else {
            passwordError.style.display = 'block';
            adminPasswordInput.value = '';
            adminPasswordInput.focus();
        }
    }

    document.getElementById('btn-admin-back').addEventListener('click', () => {
        showScreen('login');
    });

    // Master Data Sync (Now in Admin)
    const masterFileInput = document.getElementById('master-file-input');
    const syncModal = document.getElementById('sync-modal');
    const syncStatus = document.getElementById('sync-status');

    document.getElementById('btn-open-sync-admin').addEventListener('click', () => {
        syncModal.style.display = 'flex';
        syncStatus.textContent = '';
    });

    document.getElementById('btn-close-sync').addEventListener('click', () => {
        syncModal.style.display = 'none';
    });

    document.getElementById('btn-select-master-file').addEventListener('click', () => {
        masterFileInput.click();
    });

    masterFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            syncStatus.textContent = '⌛ Processando...';
            syncStatus.style.color = 'var(--accent-primary)';
            
            try {
                const result = await window.importer.importFromExcel(e.target.files[0]);
                syncStatus.textContent = `✅ Sucesso! ${result.ordersCount} OMs e ${result.routingsCount} roteiros carregados.`;
                syncStatus.style.color = 'var(--success)';
            } catch (err) {
                syncStatus.textContent = '❌ Erro ao importar. Verifique o formato.';
                syncStatus.style.color = 'var(--error)';
                console.error(err);
            }
            e.target.value = '';
        }
    });

    // Export Logic (Now in Admin)
    document.getElementById('btn-export-admin').addEventListener('click', async () => {
        const scans = await window.db.getScans();
        if (scans.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        // Prepara os dados com nomes amigáveis e conversão de tempo para o Excel
        const data = scans.map(s => {
            const start = s.startTime ? new Date(s.startTime) : null;
            const end = s.endTime ? new Date(s.endTime || s.timestamp) : new Date(s.timestamp);
            
            return {
                'Data': end.toLocaleDateString(),
                'OM': s.om,
                'ID Operador': s.operadorId,
                'Operador': s.operadorNome,
                'Operação': s.operacao,
                'Serial': s.serial,
                'Horário Início': start ? start.toLocaleTimeString() : '---',
                'Horário Fim': end.toLocaleTimeString(),
                'Tempo Produção': (s.tempo || 0) / 86400, // Converte segundos para fração de dia (Excel Time)
                'Tempo Pausa': (s.tempoPausa || 0) / 86400,
                'Motivo Pausa': s.motivoPausa || '---'
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);

        // Aplica formatação de tempo [hh]:mm:ss nas colunas de tempo
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            // Coluna I (Tempo Produção) e J (Tempo Pausa) - índices 8 e 9
            const cellI = XLSX.utils.encode_cell({r: R, c: 8});
            const cellJ = XLSX.utils.encode_cell({r: R, c: 9});
            
            if (ws[cellI]) ws[cellI].z = 'HH:mm:ss';
            if (ws[cellJ]) ws[cellJ].z = 'HH:mm:ss';
        }

        // Ajusta largura das colunas
        ws['!cols'] = [
            { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, 
            { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Apontamentos");
        
        const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
        XLSX.writeFile(wb, `Relatorio_Producao_BAUER_${dateStr}.xlsx`);
    });

    document.getElementById('btn-clear-db').addEventListener('click', async () => {
        if (confirm('ATENÇÃO: Isso apagará todos os apontamentos salvos neste tablet. Esta ação não pode ser desfeita. Deseja continuar?')) {
            await window.db.clearScans();
            renderAdminScans();
            alert('Banco de dados de apontamentos limpo com sucesso.');
        }
    });

    // Start Action
    buttons.start.addEventListener('click', async () => {
        state.activeOM = inputs.omId.value.trim();
        state.activeOperation = inputs.operation.value;
        
        showScreen('production');
    });

    // Edit Modal Events
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        document.getElementById('edit-modal').style.display = 'none';
    });

    document.getElementById('edit-start-time').addEventListener('change', calculateEditTime);
    document.getElementById('edit-end-time').addEventListener('change', calculateEditTime);
    document.getElementById('edit-pause-minutes').addEventListener('input', calculateEditTime);

    document.getElementById('btn-save-edit').addEventListener('click', saveEdit);

    // Pause Reason Selection
    document.querySelectorAll('.pause-reason-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const reason = btn.dataset.reason;
            startPause(reason);
        });
    });

    document.getElementById('btn-cancel-pause').addEventListener('click', () => {
        document.getElementById('pause-reason-modal').style.display = 'none';
    });

    document.getElementById('btn-resume-work').addEventListener('click', () => {
        resumeWork();
    });

    // Force Finish Button logic
    buttons.forceFinish.addEventListener('click', () => {
        const code = buttons.forceFinish.dataset.serial;
        if (code) {
            document.getElementById('validation-error-overlay').style.display = 'none';
            startUnit(code);
        }
    });
}

// Scanners are now managed by showScreen

function handleLogin() {
    let id = inputs.operatorId.value.trim();
    if (!id) return;
    
    // Auto-sanitize if leading zeros are present
    if (id.startsWith('0')) {
        id = sanitizeCode(id);
        inputs.operatorId.value = id;
    }

    const operator = window.Auth.login(id);
    if (operator) {
        state.activeOperator = operator;
        document.getElementById('welcome-msg').textContent = `Olá, ${operator.nome}`;
        document.getElementById('login-error').style.display = 'none';
        
        // Recupera o tempo desde o último bip deste operador
        const lastBip = localStorage.getItem(`lastBip_${operator.codigo}`);
        if (lastBip) {
            const lastTime = new Date(lastBip);
            const now = new Date();
            // Diferença em segundos
            const diff = Math.floor((now - lastTime) / 1000);
            
            // Se o intervalo for razoável (ex: menos de 4 horas), usamos ele
            // Caso contrário, começamos do zero (nova jornada)
            state.elapsedSeconds = diff < 14400 ? diff : 0;
        } else {
            state.elapsedSeconds = 0;
        }

        startTimer();
        showScreen('setup');
        setTimeout(() => inputs.omId.focus(), 500);
    } else {
        document.getElementById('login-error').style.display = 'block';
    }
}

async function renderOpenOrders() {
    const listContainer = document.getElementById('open-orders-list');
    
    // Filter orders based on actual scans performed by THIS operator
    let openOrders = [];
    try {
        // 1. Get all scans for current operator
        const allScans = await window.db.getScans();
        const myScans = allScans.filter(s => s.operadorId === state.activeOperator.codigo);
        
        // 2. Get unique OMs from those scans
        const myOMs = [...new Set(myScans.map(s => s.om))];
        
        // 3. Fetch details for these OMs from Master Data
        for (const omId of myOMs) {
            const masterOrder = await window.db.getMasterOrder(omId);
            if (masterOrder) {
                // Calculate realized count for this specific OM and Operator
                const realized = myScans.filter(s => s.om === omId).length;
                openOrders.push({
                    op: masterOrder.om,
                    desc: masterOrder.descricao,
                    total: masterOrder.quantidade,
                    realizado: realized
                });
            }
        }
    } catch (e) {
        console.error('Erro ao renderizar ordens abertas:', e);
    }

    if (openOrders.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 2rem;">Nenhuma ordem ativa.</div>';
        return;
    }

    listContainer.innerHTML = openOrders.map(order => `
        <div class="glass" style="padding: 1rem; background: rgba(255,255,255,0.02); cursor: pointer;" onclick="selectOpenOrder('${order.op}')">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                <div style="font-weight: 700; font-size: 0.9rem; color: var(--accent-primary);">OM ${order.op}</div>
                <div style="font-size: 0.85rem; font-weight: 800; color: white;">${order.realizado} / ${order.total}</div>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">${order.desc}</div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-top: 0.75rem; overflow: hidden;">
                <div style="width: ${(order.realizado/order.total)*100}%; height: 100%; background: var(--accent-primary);"></div>
            </div>
        </div>
    `).join('');
}

window.selectOpenOrder = function(opId) {
    inputs.omId.value = opId;
    validateSetup();
};

async function initProductionMode() {
    console.log('Starting production for OM:', state.activeOM);
    
    // Reset state for new session
    const order = findOrder(state.activeOM);
    state.totalPlanned = order ? order.quantidade : 0;
    state.history = [];
    state.currentSerial = null; // Garante que começamos sem serial ativo
    resetTimer(); // Mantém em 00:00 até o primeiro bip
    
    // Update UI
    document.getElementById('prod-operator-name').textContent = state.activeOperator.nome;
    document.getElementById('prod-om-id').textContent = state.activeOM;
    document.getElementById('prod-operation-name').textContent = state.activeOperation.replace(/-/g, ' ').toUpperCase();
    inputs.currentSerial.textContent = 'AGUARDANDO BIP...';
    updateProgressUI();
    renderHistory();

    // Init Scanner
    const canScan = await window.scanner.init();
    if (canScan) {
        window.scanner.start('reader', handleBarcodeScan);
    }

    // Switch Camera Button
    document.getElementById('btn-switch-camera').onclick = () => {
        window.scanner.switch('reader', handleBarcodeScan);
    };

    // Pause Button
    document.getElementById('btn-pause').onclick = (e) => {
        e.preventDefault();
        togglePause();
    };
    
    // Finish Button
    document.getElementById('btn-finish-unit').onclick = (e) => {
        e.preventDefault();
        finishUnit();
    };

    // O cronômetro já foi iniciado no Login, então aqui apenas garantimos a visibilidade
    updateTimerUI();
}

async function handleBarcodeScan(rawCode) {
    const code = sanitizeCode(rawCode);
    console.log('Bip detectado (bruto):', rawCode, 'Saneado:', code);

    // Se já existe uma peça em produção e o código é diferente, finaliza a atual e inicia a nova
    if (state.currentSerial && state.currentSerial !== code) {
        console.log('Finalizando peça atual e iniciando nova:', code);
        await finishUnit();
        // Após finalizar a anterior, inicia a nova (recursivo ou sequencial)
        setTimeout(() => handleBarcodeScan(code), 500);
        return;
    }

    // Se já existe e o código é igual, apenas finaliza
    if (state.currentSerial === code) {
        console.log('Finalizando peça atual (mesmo código):', code);
        await finishUnit();
        return;
    }

    // INÍCIO DE UMA NOVA PEÇA
    // 1. Verificar Limite de Quantidade
    const qtyCheck = await window.db.checkQuantityLimit(state.activeOM, state.activeOperation);
    if (!qtyCheck.valid) {
        showValidationError(qtyCheck.error);
        return;
    }

    // 2. Verificar Sequência de Operação
    const order = await window.db.getMasterOrder(state.activeOM);
    if (order) {
        const seqCheck = await window.db.validateSequence(state.activeOM, code, state.activeOperation, order.itemCode);
        if (!seqCheck.valid) {
            console.log('Erro de validação detectado:', seqCheck);
            showValidationError(seqCheck.error, seqCheck.type === 'duplicate' ? code : null);
            return;
        }
    }

    // Inicia a produção desta peça
    startUnit(code);
}

function startUnit(code) {
    resetTimer(); // Reseta o tempo para a nova peça
    state.currentSerial = code;
    state.unitStartTime = new Date().toISOString();
    inputs.currentSerial.textContent = code;
    startTimer();
    if (buttons.finishUnit) buttons.finishUnit.disabled = false;
    
    console.log('Produção iniciada para o serial:', code);
}

function showValidationError(message, serial = null) {
    const errorEl = document.getElementById('validation-error-overlay');
    const msgEl = document.getElementById('validation-error-msg');
    
    msgEl.textContent = message;
    errorEl.style.display = 'flex';

    if (serial) {
        buttons.forceFinish.style.display = 'block';
        buttons.forceFinish.dataset.serial = serial;
    } else {
        buttons.forceFinish.style.display = 'none';
        buttons.forceFinish.dataset.serial = '';
    }
    
    // Feedback visual (Flash Vermelho)
    document.body.classList.add('error-flash');
    setTimeout(() => document.body.classList.remove('error-flash'), 500);

    // Toca um som de erro (opcional, se houver recurso)
    console.warn('ERRO DE VALIDAÇÃO:', message);
}

function startTimer() {
    stopTimer();
    // state.elapsedSeconds já foi definido no login
    state.isPaused = false;
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').textContent = '⏸';
    
    state.timerInterval = setInterval(() => {
        if (!state.isPaused) {
            state.elapsedSeconds++;
            updateTimerUI();
        } else {
            state.pauseSeconds++; // Incrementa tempo de pausa
            updateTimerUI(); // Atualiza a interface (incluindo o cronômetro de pausa)
        }
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function resetTimer() {
    stopTimer();
    state.elapsedSeconds = 0;
    state.pauseSeconds = 0;
    state.isPaused = false;
    if (document.getElementById('btn-pause')) {
        document.getElementById('btn-pause').textContent = '⏸';
        document.getElementById('btn-pause').classList.remove('paused');
    }
    updateTimerUI();
}

function formatTime(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
}

function updateTimerUI() {
    inputs.unitTimer.textContent = formatTime(state.elapsedSeconds);
    if (state.isPaused) {
        const activePauseTimer = document.getElementById('active-pause-timer');
        if (activePauseTimer) activePauseTimer.textContent = formatTime(state.pauseSeconds);
    }
}

function togglePause() {
    if (!state.currentSerial) return;
    
    if (!state.isPaused) {
        // Solicita o motivo antes de pausar
        document.getElementById('pause-reason-modal').style.display = 'flex';
    } else {
        resumeWork();
    }
}

function startPause(reason) {
    state.isPaused = true;
    state.currentPauseReason = reason;
    
    document.getElementById('pause-reason-modal').style.display = 'none';
    document.getElementById('active-pause-reason').textContent = `MOTIVO: ${reason.toUpperCase()}`;
    document.getElementById('active-pause-overlay').style.display = 'flex';
    
    const btn = document.getElementById('btn-pause');
    if (btn) {
        btn.textContent = '▶️';
        btn.classList.add('paused');
    }
}

function resumeWork() {
    state.isPaused = false;
    document.getElementById('active-pause-overlay').style.display = 'none';
    
    const btn = document.getElementById('btn-pause');
    if (btn) {
        btn.textContent = '⏸';
        btn.classList.remove('paused');
    }
}

async function finishUnit() {
    if (!state.currentSerial) {
        console.warn('Tentativa de finalizar sem serial ativo.');
        return;
    }

    console.log('Finalizando unidade:', state.currentSerial);

    const record = {
        om: state.activeOM,
        operadorId: state.activeOperator.codigo,
        operadorNome: state.activeOperator.nome,
        operacao: state.activeOperation,
        serial: state.currentSerial,
        tempo: state.elapsedSeconds,
        tempoPausa: state.pauseSeconds,
        motivoPausa: state.currentPauseReason || 'N/A',
        startTime: state.unitStartTime,
        endTime: new Date().toISOString()
    };

    // Salva no Banco Local
    try {
        await window.db.saveScan(record);
        console.log('Apontamento salvo no IndexedDB');
    } catch (e) {
        console.error('Erro ao salvar no DB:', e);
    }

    // Atualiza Histórico Local (Session)
    state.history.unshift(record);
    state.realizedCount++;
    
    // UI Updates
    renderHistory();
    updateProgressUI();
    
    // Salva o momento deste bip para o próximo cálculo deste operador
    localStorage.setItem(`lastBip_${state.activeOperator.codigo}`, new Date().toISOString());

    // Reset da unidade
    state.currentSerial = null;
    state.unitStartTime = null;
    stopTimer();
    
    if (buttons.finishUnit) buttons.finishUnit.disabled = true;
    
    // Pequeno feedback visual
    inputs.currentSerial.textContent = 'REGISTRADO!';
    
    setTimeout(() => {
        if (!state.currentSerial) { // Só volta se ainda não bipou outra
            inputs.currentSerial.textContent = 'AGUARDANDO BIP...';
        }
    }, 1500);
}

function updateProgressUI() {
    const text = `${state.realizedCount} / ${state.totalPlanned}`;
    inputs.progressText.textContent = text;
    
    const percent = state.totalPlanned > 0 ? (state.realizedCount / state.totalPlanned) * 100 : 0;
    inputs.progressBar.style.width = `${percent}%`;
}

function renderHistory() {
    const container = inputs.historyContainer;
    if (state.history.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 2rem;">Nenhum item produzido ainda.</div>';
        return;
    }

    container.innerHTML = state.history.map(item => {
        const mins = Math.floor(item.tempo / 60);
        const secs = item.tempo % 60;
        return `
            <div class="glass" style="padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--accent-primary);">${item.serial}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(item.timestamp).toLocaleTimeString()}</div>
                </div>
                <div style="font-family: monospace; font-weight: 700;">${mins}:${secs.toString().padStart(2, '0')}</div>
            </div>
        `;
    }).join('');
}

async function renderAdminScans() {
    const container = document.getElementById('admin-scans-list');
    const scans = await window.db.getScans();
    
    if (scans.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">Nenhum apontamento no banco de dados.</div>';
        return;
    }

    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border); color: var(--accent-primary);">
                    <th style="padding: 0.5rem;">Data/Hora</th>
                    <th style="padding: 0.5rem;">OM</th>
                    <th style="padding: 0.5rem;">Operador</th>
                    <th style="padding: 0.5rem;">Operação</th>
                    <th style="padding: 0.5rem;">Serial</th>
                    <th style="padding: 0.5rem;">Produção</th>
                    <th style="padding: 0.5rem;">Pausa</th>
                    <th style="padding: 0.5rem;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${scans.reverse().map(s => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                        <td style="padding: 0.5rem;">${new Date(s.endTime || s.timestamp).toLocaleString()}</td>
                        <td style="padding: 0.5rem;">${s.om}</td>
                        <td style="padding: 0.5rem;">${s.operadorNome}</td>
                        <td style="padding: 0.5rem;">${s.operacao}</td>
                        <td style="padding: 0.5rem;">${s.serial}</td>
                        <td style="padding: 0.5rem; font-family: monospace;">${formatTime(s.tempo || 0)}</td>
                        <td style="padding: 0.5rem; font-family: monospace; color: var(--warning);">${formatTime(s.tempoPausa || 0)}</td>
                        <td style="padding: 0.5rem;">
                            <button class="btn btn-icon" onclick="openEditModal(${s.id})" style="width: 30px; height: 30px; font-size: 0.8rem;" title="Editar">✏️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function openEditModal(id) {
    const scans = await window.db.getScans();
    const record = scans.find(s => s.id === id);
    if (!record) return;

    document.getElementById('edit-record-id').value = id;
    document.getElementById('edit-om').textContent = record.om;
    document.getElementById('edit-serial').textContent = record.serial;
    
    // Se não houver startTime (registros antigos), assume endTime - tempo
    const endTime = record.endTime || record.timestamp;
    const startTime = record.startTime || new Date(new Date(endTime).getTime() - (record.tempo * 1000)).toISOString();
    
    document.getElementById('edit-start-time').value = startTime.slice(0, 16);
    document.getElementById('edit-end-time').value = endTime.slice(0, 16);
    document.getElementById('edit-pause-minutes').value = Math.floor((record.tempoPausa || 0) / 60);
    document.getElementById('edit-pause-reason').value = record.motivoPausa || 'N/A';

    calculateEditTime();
    document.getElementById('edit-modal').style.display = 'flex';
}

function calculateEditTime() {
    const start = new Date(document.getElementById('edit-start-time').value);
    const end = new Date(document.getElementById('edit-end-time').value);
    const pauseMins = parseInt(document.getElementById('edit-pause-minutes').value) || 0;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const totalDiffSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    const pauseSeconds = pauseMins * 60;
    const workingSeconds = Math.max(0, totalDiffSeconds - pauseSeconds);

    document.getElementById('edit-calculated-time').textContent = formatTime(workingSeconds);
    return { workingSeconds, pauseSeconds, start, end };
}

async function saveEdit() {
    const id = document.getElementById('edit-record-id').value;
    const { workingSeconds, pauseSeconds, start, end } = calculateEditTime();
    const motivoPausa = document.getElementById('edit-pause-reason').value;

    if (workingSeconds < 0) {
        alert('O tempo de produção não pode ser negativo. Verifique as datas e a pausa.');
        return;
    }

    const scans = await window.db.getScans();
    const oldRecord = scans.find(s => s.id === parseInt(id));
    
    const updatedRecord = {
        ...oldRecord,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        tempo: workingSeconds,
        tempoPausa: pauseSeconds,
        motivoPausa: motivoPausa
    };

    await window.db.updateScan(id, updatedRecord);
    document.getElementById('edit-modal').style.display = 'none';
    renderAdminScans();
}

window.openEditModal = openEditModal;
function handleBackspace() {
    inputs.operatorId.value = inputs.operatorId.value.slice(0, -1);
}

async function showScreen(screenId) {
    console.log('Navegando para a tela:', screenId);
    
    // Para qualquer scanner ativo antes de mudar
    try {
        await window.scanner.stop();
    } catch (e) {
        console.warn('Erro ao parar scanner:', e);
    }

    // Gerencia visibilidade
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[screenId]) {
        screens[screenId].classList.add('active');
    } else {
        console.error('Tela não encontrada:', screenId);
        return;
    }

    // Inicializa scanners específicos da tela
    try {
        if (screenId === 'login') {
            const canScan = await window.scanner.init();
            if (canScan) {
                window.scanner.start('login-reader', (code) => {
                    inputs.operatorId.value = sanitizeCode(code);
                    handleLogin();
                });
            }
        } else if (screenId === 'setup') {
            const canScan = await window.scanner.init();
            if (canScan) {
                window.scanner.start('setup-reader', (code) => {
                    inputs.omId.value = sanitizeCode(code);
                    validateSetup();
                });
            }
        } else if (screenId === 'production') {
            initProductionMode();
        }
    } catch (err) {
        console.error('Erro ao iniciar scanner na tela ' + screenId, err);
    }
}

let lastValidatedOM = null;

async function validateSetup() {
    let om = inputs.omId.value.trim();
    
    // Auto-sanitize leading zeros if present
    if (om.length > 0 && om.startsWith('0')) {
        om = sanitizeCode(om);
        inputs.omId.value = om;
    }

    const opSelect = inputs.operation;
    
    if (om.length >= 1) {
        // Se a OM mudou, precisamos buscar novos dados
        if (om !== lastValidatedOM) {
            console.log('OM mudou ou nova validação:', om);
            let order = await window.db.getMasterOrder(om);

            const detailsEl = document.getElementById('om-details');
            const itemEl = document.getElementById('detail-item');
            const qtyEl = document.getElementById('detail-qty');

            if (order) {
                lastValidatedOM = om; // Marca como validada
                if (detailsEl) detailsEl.style.display = 'block';
                if (itemEl) itemEl.textContent = order.descricao || "Item Desconhecido";
                if (qtyEl) qtyEl.textContent = order.quantidade || "0";
                
                // Popula operações apenas se a OM mudou
                if (order.itemCode) {
                    const routings = await window.db.getMasterRoutings(order.itemCode.toString().trim());
                    if (routings && routings.length > 0) {
                        opSelect.innerHTML = '<option value="" disabled selected hidden>Selecione a etapa...</option>' + 
                            routings.filter(r => {
                                        const op = r.operacao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        return !op.includes('TESTE') && !op.includes('DISTRIBUICAO');
                                    })
                                    .sort((a, b) => a.sequencia - b.sequencia)
                                    .map((r, index) => `<option value="${r.operacao}">${index + 1}. ${r.operacao}</option>`)
                                    .join('');
                        
                        // Se houver apenas UMA operação, seleciona ela automaticamente
                        const validOps = routings.filter(r => {
                            const op = r.operacao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            return !op.includes('TESTE') && !op.includes('DISTRIBUICAO');
                        });
                        if (validOps.length === 1) {
                            opSelect.value = validOps[0].operacao;
                        }
                    } else {
                        opSelect.innerHTML = '<option value="" disabled selected hidden>Nenhuma operação encontrada...</option>';
                    }
                }
            } else {
                lastValidatedOM = null;
                if (itemEl) itemEl.textContent = "OP não encontrada";
                opSelect.innerHTML = '<option value="" disabled selected hidden>---</option>';
                if (detailsEl) detailsEl.style.display = 'none';
            }
        }
        
        // Habilita o botão se houver uma OM válida E uma operação selecionada
        buttons.start.disabled = !(lastValidatedOM && opSelect.value);
    } else {
        lastValidatedOM = null;
        const detailsEl = document.getElementById('om-details');
        if (detailsEl) detailsEl.style.display = 'none';
        buttons.start.disabled = true;
    }
}

function findOrder(omId) {
    if (!window.BAUER_DATA || !window.BAUER_DATA.orders) return null;
    return window.BAUER_DATA.orders.find(o => o.op.toString() === omId.toString());
}
