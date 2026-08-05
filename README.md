# Sifriyah

Sifriyah (ספרייה — "biblioteca" em hebraico) é um sistema de gestão de empréstimos para uma biblioteca caseira/comunitária (Grupo Caseiro), sem servidor próprio — só Firestore e GitHub Pages.

- **`index.html`** — página inicial, só com dois botões, levando pra um lado ou pro outro — útil como link único pra compartilhar.
- **`admin/`** — onde você cadastra o acervo, controla empréstimos, pessoas e financeiro. Protegido por login.
- **`catalogo/`** — vitrine pública, onde qualquer um vê o acervo disponível e pede reserva/fila pelo seu WhatsApp. Sem login.

Pra saber o que o app faz (modelo de dados, fórmulas de preço e multa, criptografia, sincronização, backups etc.), veja o `FUNCIONALIDADES.md`. Este arquivo aqui é só sobre como configurar e publicar.

## Configuração (uma vez só)

### 1. Firebase

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com)
2. Ative **Firestore Database** (modo produção)
3. Ative **Authentication → método Email/senha**
4. Em Configurações do projeto → Seus apps → adicione um app Web, copie o objeto `firebaseConfig` e cole em `admin/src/firebase-config.jsx` (`FIREBASE_CONFIG_PADRAO`) — é a mesma configuração que também precisa estar em `catalogo/index.html` (procure por `const firebaseConfig = {`)
5. Em Firestore → Regras, cole o conteúdo de `firestore.rules` e publique

### 2. Contas de admin

Não existe cadastro público — só você cria as contas, em Firebase Console → Authentication → Users → **Add user** (um e-mail e senha por pessoa). Qualquer conta autenticada tem acesso de administrador ao Sifriyah (diferente do WTG Quizzing, aqui não há separação de dados por conta — é uma biblioteca só, gerida por um grupo de confiança).

### 3. Notificações por Telegram (opcional)

Avisa automaticamente, via bot do Telegram, quando chega um pedido novo de fila/reserva pela vitrine — sem isso o app funciona normalmente, só não notifica fora da aba Fila.

1. Crie um bot com o [@BotFather](https://t.me/BotFather) no Telegram e copie o token
2. Descubra o `chat_id` pra onde o bot deve mandar mensagem (ex.: conversando com [@userinfobot](https://t.me/userinfobot), ou olhando a resposta de `getUpdates` depois de mandar uma mensagem pro bot)
3. Em Configurações do projeto Firebase → Contas de serviço → **Gerar nova chave privada**, baixa um JSON
4. No repositório do GitHub → Settings → Secrets and variables → Actions, crie:
   - `FIREBASE_SERVICE_ACCOUNT` — o JSON inteiro da chave de serviço
   - `TELEGRAM_BOT_TOKEN` — o token do bot
   - `TELEGRAM_CHAT_ID` — o chat_id de destino
   - `SIFRIYAH_APP_PASSWORD` — a senha local do app (a mesma usada pra desbloquear o Sifriyah); se ela for trocada no app, precisa atualizar aqui também
5. O workflow (`.github/workflows/notificar-pedidos.yml`) já vem pronto, rodando a cada 6 horas — não precisa mexer nele

### 4. Publicar (GitHub Pages)

Suba a pasta inteira num repositório e ative o GitHub Pages na raiz. Os sites ficam em:

- `https://seuusuario.github.io/repo/` — página inicial
- `https://seuusuario.github.io/repo/admin/` — administração
- `https://seuusuario.github.io/repo/catalogo/` — vitrine pública

Sem build step — é só HTML/CSS/JS puro (o app admin compila o React com Babel Standalone direto no navegador).

### 5. Instalar como app (PWA)

`admin/` e `catalogo/` podem ser instalados separadamente num tablet ou celular, com ícone próprio na tela e sem barra de endereço (a página inicial não precisa, já que só existe pra escolher um dos dois):

- **Android/Chrome:** abra o site → menu (⋮) → "Instalar app"
- **iPad/iPhone (Safari):** abra o site → Compartilhar → "Adicionar à Tela de Início"
