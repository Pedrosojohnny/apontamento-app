# Especificação Funcional: Sistema de Apontamento de Produção

## 1. Visão Geral
O objetivo deste aplicativo é automatizar o registro de tempos de montagem e quantidades produzidas em uma linha de produção de painéis de automação. O sistema deve operar em tablets fixos, utilizando a câmera integrada para ler códigos de barras (Code 128) e registrar o tempo de cada operação individual por peça.

## 2. Requisitos de Usuário e Autenticação
- **Identificação por Número ou Barcode**: Cada operador possui um número de identificação exclusivo, que pode ser digitado ou lido via código de barras (crachá).
- **Saneamento Automático**: O sistema remove automaticamente zeros à esquerda de IDs de operadores, OMs e Números de Série para garantir consistência de dados.
- **Login por Scanner**: A tela inicial permite o uso da câmera para leitura rápida do crachá do operador.
- **Persistência de Sessão**: O tempo de jornada do operador é mantido mesmo após bips de peças, e o sistema recupera o tempo decorrido caso o operador retorne em um intervalo de até 4 horas.
- **Acesso Administrativo**: Área restrita para configurações, edição de registros e exportação de dados, acessível via senha (**PCP2000**).

## 3. Fluxo de Trabalho (Workflow)

### 3.1. Configuração da Sessão (Setup)
1. O operador informa seu **ID de Operador**.
2. O operador seleciona ou escaneia a **Ordem de Montagem (OM)**.
3. O sistema exibe detalhes da OM (Item e Qtd Planejada) e busca automaticamente o **Roteiro de Operações** vinculado.
4. O operador seleciona a **Etapa/Operação** que será realizada.
5. **Meus Apontamentos Recentes**: O sistema exibe uma lista de OMs onde o operador já realizou apontamentos, permitindo seleção rápida.

### 3.2. Ciclo de Produção (Rastreamento por Unidade)
1. **Início da Unidade**: O operador escaneia o serial da peça (Code 128).
2. **Cronometragem**: Ao detectar o código, o sistema inicia o cronômetro para aquela unidade. Se o mesmo código for bipado novamente, a unidade é finalizada.
3. **Pausa**: Botão de "Pausa" para interrupções, registrando o tempo de parada separadamente.
4. **Finalização**: O registro é salvo no IndexedDB local e o sistema fica pronto para o próximo serial.
5. **Trava de Sequência**: Impede o registro se o serial não tiver passado pela operação anterior obrigatória.
6. **Trava de Quantidade**: Bloqueia novos registros se a meta da OM para aquela etapa for atingida.
7. **Tratamento de Duplicidade (Retomada)**: Se um serial já registrado for bipado para a mesma operação, o sistema exibe um aviso com a opção **"Finalizar Operação"**. Isso permite que o operador retome e finalize peças que foram iniciadas em turnos anteriores ou dias diferentes.

## 4. Requisitos de Dados

### 4.1. Dados de Entrada (Master Data)
- **Aba Ordens**: OM, Código Item, Quantidade.
- **Aba Roteiros**: Código Item, Sequência, Operação.
- **Sincronização**: Importação via Excel no painel administrativo com mapeamento inteligente de colunas.

### 4.2. Dados de Saída (Relatório Excel)
Exportação consolidada contendo:
- Data da Operação.
- Número da OM.
- ID e Nome do Operador.
- Descrição da Operação.
- Número de Série (Serial).
- **Horário de Início** e **Horário de Fim**.
- Tempo Líquido de Produção (HH:mm:ss).
- Tempo de Pausa (HH:mm:ss).

## 5. Segurança e Administração
- **Painel PCP**: Protegido por senha.
- **Edição de Registros**: O administrador pode ajustar horários de início/fim e tempos de pausa de apontamentos já realizados para corrigir erros operacionais.
- **Limpeza de Base**: Opção para apagar todos os registros locais após a exportação bem-sucedida.

## 6. Requisitos Técnicos e Interface
- **Armazenamento**: IndexedDB (Offline First).
- **Bibliotecas**: `html5-qrcode` (Scanner) e `SheetJS` (Excel).
- **Interface**: Design Industrial Premium com modo escuro, glassmorphism e feedback visual de erros (Flash vermelho).
- **Indicadores**: Barra de progresso dinâmica em tempo real durante a produção.
