# Continuidade — Sifriyah (pra uma conversa nova)

Este arquivo é um resumo de estado pra colar no início de uma conversa nova com o Claude, sem precisar reexplicar tudo do zero. O `README.md` do repositório é a documentação funcional completa (modelo de dados, fórmulas, arquitetura) — este arquivo aqui é sobre **onde as coisas estão** e **o que ainda está em aberto**.

Repositório: `https://github.com/weigler/sifriyah`, publicado via GitHub Pages.

## O que é o projeto

Sifriyah é um sistema de empréstimos pra uma biblioteca caseira/comunitária (Grupo Caseiro). Objetivo de longo prazo declarado pelo dono do projeto: **evoluir isso pra virar o "IPN Books"**, um sistema replicado numa biblioteca maior da Igreja — ainda não iniciado, só preparado estruturalmente (ver seção "Preparo pro IPN Books" abaixo).

## Estrutura atual do repositório

```
index.html                    → página inicial: só dois botões (Catálogo / Administração), sem lógica,
                                  sem Firebase — mesmo padrão do índex raiz do WTG Quizzing
icon-192.png                   → favicon da página inicial (cópia de admin/icon-192.png; a página
                                  inicial não é instalável como PWA, só usa isso como ícone da aba)

admin/                          → pasta autocontida do app admin (HTML + manifest + ícones + código)
  index.html                   → carregador do app admin (busca os arquivos de admin/src/, compila com
                                  Babel, roda)
  manifest.json                → PWA do app admin (ícones locais, dentro da própria pasta)
  icon-192.png / icon-512.png  → ícones do app admin
  src/
    utils.jsx                  → const globais (React destructure, window.storage), APP_NAME, COLORS,
                                  NIVEIS_LEITURA, formatação (fmtDate, fmtMoney, fmtDataHora), cálculos
                                  (calcularMulta, calcularValorSugerido, diasAtraso, gerarCodigoUsuario)
    crypto.jsx                 → PBKDF2 + AES-GCM (deriveKey, encryptJSON, decryptJSON)
    firebase-config.jsx        → FIREBASE_CONFIG_PADRAO + DOC_ID_PADRAO, já embutidos no código-fonte
                                  (mesmo modelo do shared/firebase-config.js do WTG Quizzing) — evita ter
                                  que colar a configuração manualmente em cada aparelho novo
    firebase.jsx                → tudo de Firestore/Auth: inicializarFirebase, aguardarAuthPronto,
                                  entrarComoAdminNuvem, nuvem* (ler/salvar seções, backups, pré-cadastros,
                                  pedidos de fila), local* (fallback sem nuvem). lerConfigNuvem() cai no
                                  padrão embutido quando o aparelho não tem nada salvo, a menos que a
                                  nuvem tenha sido desligada de propósito (flag sifriyah-cloud-desligada)
    dados.jsx                  → migração de dados (migrarDados), seções (montarSecoes/combinarSecoes),
                                  nomeCompleto, normalizaTelefone, linkWhatsApp
    ui-kit.jsx                 → Button, Input, Section, EmptyState, CampoCol, BotaoExcluir, SeletorTags,
                                  BotaoDevolver, Stamp
    App.jsx                    → componente principal — todo o estado, efeitos, regras de negócio
    EmprestimosTab.jsx         → aba Empréstimos (inclui multa, filtro atrasados, +1 semana, mensagens)
    AcervoTab.jsx               → aba Acervo (cadastro/edição de livros, busca de capa)
    CategoriasTab.jsx          → aba Categorias
    PessoasTab.jsx              → aba Pessoas (código de usuário, pré-cadastros)
    FilaPedidosTab.jsx         → aba Fila (pedidos de fila E reserva vindos da vitrine)
    FinanceiroTab.jsx          → aba Financeiro
    AjustesTab.jsx              → aba Ajustes (nuvem, senha, backups, textos das mensagens, notificações)
    TelaSenha.jsx                → tela de bloqueio / login de admin / criar-ou-entrar

catalogo/                       → pasta autocontida da vitrine pública (HTML + manifest + ícones)
  index.html                   → vitrine pública (HTML/JS solto, sem React) — busca, reserva, fila,
                                  pré-cadastro. Já tem o firebaseConfig embutido há tempos (mesma
                                  configuração de admin/src/firebase-config.jsx).
  manifest.json                → PWA da vitrine pública (ícones locais)
  icon-192.png / icon-512.png  → ícones da vitrine pública

README.md                      → como configurar e publicar (Firebase, contas de admin, Telegram,
                                  GitHub Pages, PWA) — modelo do README do WTG Quizzing
FUNCIONALIDADES.md             → documentação funcional completa (modelo de dados, fórmulas, arquitetura)
                                  — era o conteúdo antigo do README.md, movido pra cá
firestore.rules                → regras do Firestore versionadas no repo (antes só existiam no Console);
                                  copiar daqui pro Console sempre que mudar
.github/workflows/notificar-pedidos.yml   → GitHub Action, roda a cada 6 horas
scripts/checar-pedidos.js + package.json  → notifica pedidos novos de fila/reserva no Telegram
```

`sifriyah-icone-v2.png` (órfão, não referenciado em nada) foi apagado nessa reorganização.

⚠️ **Consequência da reorganização em pastas:** as URLs mudaram —
`https://weigler.github.io/sifriyah/` agora é só a página inicial (com os dois botões);
o app admin foi para `https://weigler.github.io/sifriyah/admin/`; a vitrine pública foi
de `catalogo.html` para `https://weigler.github.io/sifriyah/catalogo/` (o dono do projeto
topou trocar o QR code e o link já compartilhado). Qualquer atalho de PWA instalado antes
dessa mudança precisa ser reinstalado a partir da pasta nova (`admin/` ou `catalogo/`).

`sifriyah.jsx` (o arquivo único antigo, pré-divisão) foi **descontinuado** — pode existir ainda no repo como peça de museu, mas nada carrega ele.

## Como o app roda (sem build)

`index.html` não tem lógica nenhuma — só um `<script>` que faz `fetch` de cada arquivo em `src/` (em ordem), junta tudo num texto só, compila com `Babel.transform(src, { presets: [["react", { runtime: "classic" }]] })` e executa com `eval`. Isso significa:

- **Nenhum arquivo em `src/` pode usar `import`/`export`** — tudo é `function`/`const` soltos, no escopo global compartilhado entre os arquivos (igual vários `<script>` clássicos na mesma página).
- A ordem de carregamento é a lista `arquivos` dentro do `<script>` do `index.html`, não o nome dos arquivos.
- Já bateu um bug real disso: ao dividir o arquivo original, a linha `import React ... from "react"` (que fazia sentido no arquivo único) foi parar dentro do `utils.jsx` por acidente, e quebrou o site com `Cannot use import statement outside a module`. Foi corrigido (virou `const { useState, ... } = React;` + o polyfill `window.storage`, ambos agora no topo do `utils.jsx`). Se qualquer arquivo novo for criado a partir de código copiado de outro lugar, **checar sempre se não sobrou `import`/`export`**.

## Coleções do Firestore em uso

| Coleção | Quem lê | Quem escreve |
|---|---|---|
| `sifriyah` | admin | admin |
| `sifriyah_backups` | admin | admin |
| `sifriyah_publico` | pública | admin |
| `sifriyah_precadastros` | admin | pública (create) / admin (resto) |
| `sifriyah_pedidos_fila` | admin | pública (create) / admin (resto) |
| `sifriyah_notificacoes` | só o script do GitHub Actions (Admin SDK, ignora regras) | idem |

Regras publicadas hoje no Firestore Console — copiar de lá se precisar conferir; não tenho como ler o console diretamente.

## Notificação via Telegram (bot)

Roda fora do app, via GitHub Actions (`scripts/checar-pedidos.js`, agendado a cada 6 horas — o workflow em si é a fonte da verdade, conferir `.github/workflows/notificar-pedidos.yml` se mudar). Decifra a seção `pessoas` (usando a senha local do app, guardada como Secret) pra resolver código de usuário → nome/telefone reais na mensagem. Segredos necessários no GitHub (Settings → Secrets and variables → Actions):
- `FIREBASE_SERVICE_ACCOUNT` (JSON da chave de serviço — acesso total, ignora regras)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SIFRIYAH_APP_PASSWORD` (a senha local do app — **se ela for trocada no app, precisa atualizar aqui também**, senão o script volta a mostrar só o código puro)

Cada pedido é notificado **uma única vez** (controlado por um relógio salvo em `sifriyah_notificacoes/{docId}.ultimoAvisoEm`), independente de aceito/descartado.

**Em aberto, discutido mas não implementado**: dar pro bot a capacidade de *receber* comandos (reservar/entrar na fila puxado do próprio Telegram, não só notificar). Isso exigiria um webhook — GitHub Pages não serve; a ideia foi apontada pro **Cloudflare Workers** (plano grátis, sem cartão) como próximo passo, se quiser seguir.

## Preparo pro IPN Books

Ainda não iniciado de verdade — o que já foi feito, estruturalmente, é:
- Divisão em arquivos por responsabilidade (`admin/src/`), isolando marca/identidade (`utils.jsx`:
  `APP_NAME`, `COLORS`) e configuração do Firebase (`firebase-config.jsx`, `firebase.jsx`) do resto.
- Divisão em pastas autocontidas (`admin/`, `catalogo/`, cada uma com seu próprio HTML, manifest e
  ícones) — pra clonar o projeto pro IPN Books, dá pra copiar cada pasta e trocar só o que está em
  `firebase-config.jsx` (projeto Firebase) e `utils.jsx` (marca/cores), sem precisar reorganizar nada.
- Configuração do Firebase embutida no código-fonte (`admin/src/firebase-config.jsx`,
  `FIREBASE_CONFIG_PADRAO` + `DOC_ID_PADRAO`), em vez de precisar colar na mão em cada aparelho.

Pra replicar de fato (nova biblioteca, novo projeto Firebase), ainda falta pensar em coisas como: múltiplos `docId`/bibliotecas rodando ao mesmo tempo (já suportado via `cloudDocId`, mas nunca testado com 2 bibliotecas reais ao mesmo tempo), e o limite de 10 backups automáticos (já configurável, mas o padrão pode não servir pra uma operação maior).

## Coisas conferidas e sem problema (não precisa reabrir)

- Timezone: `todayISO()` corrigido pra usar data local do navegador, não UTC (antes virava o dia seguinte à noite no Brasil).
- Variáveis de template das mensagens WhatsApp (`{dataInicio}`, `{dataFim}`, etc.) funcionam nas três mensagens (cobrança, renovação, confirmação) — antes só funcionavam na de confirmação.
- Auditoria pós-divisão: sem `import`/`export` sobrando, sem função/componente duplicado, sem componente usado em JSX que não existe em nenhum arquivo.
