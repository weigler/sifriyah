# Sifriyah

**Sifriyah** (ספרייה — "biblioteca" em hebraico) é um sistema simples de gestão de empréstimos de livros, feito para uma biblioteca caseira/comunitária (Grupo Caseiro). Roda direto no navegador, sem build, sem servidor próprio — só HTML + React (via CDN) e Firebase Firestore como banco de dados.

Duas partes:

- **`index.html` / `sifriyah.jsx`** — o app administrativo: onde quem cuida da biblioteca cadastra livros, registra empréstimos, controla pagamentos, pessoas e fila de espera.
- **`catalogo.html`** — a vitrine pública: uma página só de leitura (mais um pequeno formulário) que qualquer pessoa acessa pra ver o acervo, pedir reserva ou entrar na fila, sem precisar de login.

`sifriyah.jsx` é o código-fonte "puro"; `index.html` é a mesma coisa empacotada com Babel Standalone rodando direto no navegador (sem etapa de build).

## Funcionalidades

### App administrativo

- **Acervo** — cadastro e edição de livros: título, autor, páginas, data de aquisição, categoria, nível de leitura (Infantil → Acadêmico), valor semanal, valor da semana extra, unidades disponíveis, semanas iniciais, sinopse, tags, link externo (Amazon etc.) e capa.
- **Empréstimos** — registra quem pegou qual livro, com prazo e valor combinado. Regras automáticas: só um livro por pessoa por vez, e ninguém com débito de empréstimo anterior consegue pegar outro até quitar. Permite renovar por mais uma semana (bloqueado se houver alguém esperando na fila daquele livro), registrar pagamentos parciais e devolver com desconto sugerido pelos dias não usados.
- **Mensagens via WhatsApp** — um clique gera a mensagem certa e abre o WhatsApp: confirmação de empréstimo (com data inicial, final e valor), cobrança de valor pendente, lembrete de prazo, ou SMS. Todos os textos são editáveis em Ajustes.
- **Pessoas** — cadastro de quem usa a biblioteca, com um código de usuário curto gerado automaticamente para cada pessoa (usado pra entrar na fila pelo catálogo público sem precisar digitar nome/telefone toda vez). O código pode ser regenerado a qualquer momento e enviado direto por WhatsApp.
- **Fila** — pedidos de "entrar na fila" enviados pela vitrine pública chegam aqui pra revisão; aceitar coloca a pessoa de verdade na fila de espera do livro (criando o cadastro dela se for a primeira vez).
- **Financeiro** — visão geral de valores combinados, pagos e pendentes.
- **Backups** — cópias automáticas e manuais dos dados, com restauração pelo próprio app.
- **Proteção por senha** — os dados (livros, pessoas, empréstimos, ajustes) são criptografados no navegador com uma senha local antes de ir pra nuvem; o Firebase nunca vê os dados em texto puro. Há também um modo "sem senha" opcional.
- **Sincronização multi-dispositivo (opcional)** — conectando a um projeto Firebase, os dados sincronizam entre celular, tablet e computador em tempo real, com login de administrador (Firebase Authentication) protegendo o acesso.

### Vitrine pública (`catalogo.html`)

- Lista os livros disponíveis, com busca por título, autor, nível de leitura e tags, além de filtro por categoria.
- Mostra capa, sinopse, valor por semana e status (disponível / emprestado).
- **Reservar** um livro disponível ou **entrar na fila** de um livro emprestado — direto pelo navegador, sem precisar de WhatsApp: usando o código de usuário (se já tiver) ou nome + telefone.
- **Pré-cadastro** rápido pra quem ainda não é cadastrado, facilitando o próximo empréstimo.
- Não exige login — é pensada pra ser compartilhada livremente com o grupo.

## Arquitetura

- **Frontend**: React 18 (via CDN, `unpkg.com`) + Babel Standalone, sem etapa de build — o `index.html` já é o app pronto, direto na pasta.
- **Dados**: Firebase Firestore, com os dados sensíveis (livros, pessoas, empréstimos, ajustes) armazenados como blobs criptografados (AES, via Web Crypto API) usando a senha local do app — não a autenticação do Firebase.
- **Autenticação**: Firebase Authentication (e-mail/senha) protege leitura e escrita das coleções privadas, quando as regras do Firestore exigem `request.auth != null`.
- **Estático**: hospedado no GitHub Pages, sem backend próprio.
- **PWA**: `manifest.json` + ícones permitem "instalar" o app na tela inicial do celular.

## Estrutura de arquivos

```
index.html       → app administrativo, pronto pra rodar (Babel Standalone + React via CDN)
sifriyah.jsx      → código-fonte do app administrativo (mesmo conteúdo, sem o wrapper HTML)
catalogo.html     → vitrine pública do acervo
manifest.json     → manifesto PWA do app administrativo
icon-192.png
icon-512.png      → ícones do PWA
```

## Configuração (Firebase)

O app funciona sem nuvem nenhuma (modo local, `localStorage`), mas pra sincronizar entre aparelhos e publicar a vitrine pública é preciso um projeto Firebase com:

1. **Firestore Database** ativado, com as coleções abaixo protegidas por regras de segurança:

   | Coleção | Leitura | Escrita |
   |---|---|---|
   | `sifriyah` (dados criptografados) | admin | admin |
   | `sifriyah_backups` | admin | admin |
   | `sifriyah_publico` (vitrine) | pública | admin |
   | `sifriyah_precadastros` | admin | criação pública, resto admin |
   | `sifriyah_pedidos_fila` | admin | criação pública, resto admin |

2. **Authentication** com o provedor **E-mail/senha** ativado, e um usuário admin criado — esse login é diferente da senha local que criptografa os dados.

A configuração do projeto (chaves do Firebase) e o login de administrador são colados direto na tela de bloqueio do app, na primeira vez que se conecta a nuvem em cada aparelho.

## Como publicar

Sem build: é só servir os arquivos estáticos. Hoje está publicado via GitHub Pages em `https://weigler.github.io/sifriyah/`.
