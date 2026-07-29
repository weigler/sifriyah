# Sifriyah

Sifriyah (ספרייה — "biblioteca" em hebraico) é um sistema de gestão de empréstimos para uma biblioteca caseira/comunitária. Este documento descreve **o que cada parte do sistema faz e como foi construída por dentro** — modelo de dados, fórmulas de cálculo, regras de negócio, criptografia, sincronização e backups.

O sistema é dividido em duas metades:

- **App administrativo** (`index.html` / `sifriyah.jsx`) — React 18 rodando no navegador via Babel Standalone, sem etapa de build. É onde todo o estado vive e onde as regras de negócio são aplicadas.
- **Vitrine pública** (`catalogo.html`) — uma página estática independente, sem framework, que só lê um documento público do Firestore e escreve pedidos avulsos (reserva, fila, pré-cadastro).

As duas se comunicam exclusivamente através do Firestore — não há API própria, backend, ou processo servidor.

---

## Modelo de dados

Todo o estado do app vive em memória (`useState`) em quatro grandes coleções, que são também a unidade de criptografia e sincronização (ver [Seções](#seções-criptografia-e-sincronização)):

| Seção | Contém |
|---|---|
| `acervo` | `livros`, `categorias`, `tags` |
| `pessoas` | `pessoas` |
| `emprestimos` | `emprestimos`, `cobrancas`, `filas` |
| `ajustes` | `config` |

### Livro

```
{ id, titulo, autor, paginas, dataAquisicao, categoria, nivel,
  valorSemanal, valorSemanaExtra, quantidade, limiteSemanas,
  sinopse, tags: [], linkExterno, capaUrl }
```

- `valorSemanal` é o preço-base de aluguel por semana, usado para sugerir o valor de um empréstimo novo (`valorSemanal × limiteSemanas`) e para calcular o desconto de devolução antecipada.
- `valorSemanaExtra` é o preço de cada semana **além** do combinado original — usado tanto na renovação manual ("+1 semana") quanto no cálculo automático de multa por atraso. Se não estiver preenchido, todo o sistema cai de volta para `valorSemanal` como aproximação.
- `quantidade` é o número de unidades físicas daquele título; o sistema permite empréstimos simultâneos até esse limite (`unidadesEmprestadas(livroId) < quantidade`).
- `nivel` é um enum fechado: `Infantil, Juvenil, Iniciante, Intermediário, Avançado, Acadêmico`.

### Pessoa

```
{ id, nome, sobrenome, telefone, email, genero, codigoUsuario }
```

`codigoUsuario` é gerado automaticamente na criação de toda pessoa nova (via `upsertPessoa`, ou implicitamente ao registrar um empréstimo ou aceitar um pedido de fila para alguém ainda não cadastrado). É uma string de 6 caracteres sorteada do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — deliberadamente sem `0/O`, `1/I/L`, para reduzir erro ao ditar o código por telefone. A geração checa unicidade contra os códigos já existentes antes de aceitar. Pode ser regenerado a qualquer momento pelo admin (`regerarCodigoPessoa`) ou editado manualmente. Esse código é a única "autenticação" que a vitrine pública pede de alguém que já é cadastrado, para entrar na fila ou reservar um livro sem precisar digitar nome e telefone de novo.

### Empréstimo

```
{ id, livroId, pessoaId, dataEmprestimo, prazo, valorCombinado,
  pagamentos: [{ id, valor, data }], devolvido, dataDevolucao, multaAnulada }
```

`valorCombinado` é um número simples, não uma fórmula armazenada — cada evento que altera o preço (criação, renovação, desconto de devolução) escreve um novo valor direto no campo. O histórico de *como* se chegou a esse número não é guardado; só o resultado.

### Fila (`filas`)

```
{ id, livroId, pessoaId, criadoEm }
```

Fila de espera interna, por livro. É uma lista simples — a posição de cada pessoa na fila é implícita pela ordem de inserção (`criadoEm`), não há um campo de posição explícito.

### Cobrança (`cobrancas`)

```
{ id, emprestimoId, tipo: "cobranca" | "lembrete" | "sms", valor, data }
```

Registro de auditoria: toda vez que uma mensagem de cobrança, lembrete de prazo ou SMS é disparada pelo app, uma entrada é gravada aqui — mesmo que a pessoa nunca tenha realmente recebido a mensagem (o app não tem como confirmar entrega de um link `wa.me`). Serve para a aba Financeiro mostrar o que já foi tentado.

### Config (`ajustes`)

Chave Pix, nome do recebedor, WhatsApp de contato geral, link da vitrine, promoção ativa (`{ ativa, descricao, validoAte, desconto }`) e os três modelos de mensagem editáveis (`modeloCobranca`, `modeloRenovacao`, `modeloConfirmacao`).

---

## Precificação e cálculos financeiros

Não existe uma "tabela de preços" central — cada livro carrega seu próprio preço semanal, e todo o resto é derivado no momento em que é exibido (nada fica pré-calculado e armazenado, exceto `valorCombinado`).

**Valor sugerido ao criar um empréstimo** (`calcularValorSugerido`):
```
valor = livro.valorSemanal × livro.limiteSemanas
se promoção ativa e (sem data-limite OU validoAte >= hoje):
    valor -= promoção.desconto
```
O prazo sugerido é `hoje + limiteSemanas` (em semanas, `somarSemanas`).

**Renovação manual — "+1 semana"** (`renovarSemana`): soma 7 dias ao prazo atual (ou a partir de hoje, se já não havia prazo) e acrescenta `valorSemanaExtra` (ou `valorSemanal`) ao `valorCombinado`. Bloqueada (botão desabilitado) se houver qualquer pessoa na fila digital daquele livro — a lógica é: se tem gente esperando, o livro devia voltar, não ser estendido.

**Desconto na devolução antecipada**: ao devolver, o app calcula quantos dias restavam até o prazo (`diasRestantes`), converte em semanas completas não usadas (`Math.floor(diasRestantes / 7)`) e sugere abater `semanas × valorSemanal` do total combinado. É só uma sugestão pré-preenchida — o admin confirma o valor final na hora de devolver.

**Multa por atraso** (`calcularMulta` / `diasAtraso`) — não é armazenada, é **recalculada a cada renderização** a partir da data atual:
```
diasAtraso = max(0, hoje - prazo)          # só se não devolvido e há prazo
semanasAtraso = ceil(diasAtraso / 7)
valorSemana = config.valorMultaSemanal (se preenchido) OU valorSemanaExtra OU valorSemanal do livro
multa = semanasAtraso × valorSemana
```
`valorMultaSemanal` é um campo opcional em Ajustes — um valor único, geral, que substitui a taxa por livro quando preenchido. Se deixado em branco, cada livro usa sua própria taxa (`valorSemanaExtra`, com `valorSemanal` como último recurso).
Se `emprestimo.multaAnulada === true`, a multa é sempre 0, independente do atraso — um botão "anular multa" / "reativar multa" alterna essa flag por empréstimo. Isso existe especificamente para cobrir o caso de o livro já ter sido devolvido na prática, mas o admin só ter marcado isso no sistema alguns dias depois: sem a anulação, o atraso "de sistema" geraria uma multa indevida.

Por ser puramente derivada (não persistida), a multa nunca fica dessincronizada — junto com o pagamento, ela entra automaticamente em:
- `restante` (o "falta pagar" mostrado em cada empréstimo e usado no texto de cobrança),
- na regra de bloqueio de débito (abaixo),
- nos totais da aba Financeiro (`totalMultas`, somado a `totalCombinado`).

**Regras de bloqueio ao registrar um empréstimo novo**, checadas nessa ordem:
1. **Um livro por pessoa por vez** — bloqueia se a pessoa já tem qualquer empréstimo com `devolvido: false`.
2. **Débito pendente** (`pessoaTemDebito`) — soma `valorCombinado + multa − totalPago` de **todos** os empréstimos da pessoa (devolvidos ou não); se qualquer um estiver positivo, bloqueia até quitar.

**Total pago** (`totalPago`): soma simples do array `pagamentos` de um empréstimo — pagamentos parciais são permitidos e ficam listados individualmente (com opção de remover um lançamento errado).

---

## Seções, criptografia e sincronização

### Por que 4 seções, e não um blob único

Os dados nunca chegam ao Firestore em texto puro. Antes de salvar, o estado inteiro é dividido em 4 seções (`montarSecoes`) e cada uma é criptografada **separadamente**:

```
acervo:      { livros, categorias, tags }
pessoas:     { pessoas }
emprestimos: { emprestimos, cobrancas, filas }
ajustes:     { config }
```

Isso existe por dois motivos práticos: (1) autosave granular — editar só um livro não precisa recriptografar/reenviar pessoas e empréstimos também; (2) o formato antigo (anterior a essa divisão) guardava tudo num blob único no campo `blob` da raiz do documento — esse formato legado ainda é lido como fallback por `migrarDados`, mas nunca mais escrito.

Ao carregar, o processo inverso (`combinarSecoes`) remonta o objeto único a partir das 4 seções decodificadas, que então passa por `migrarDados` — responsável por preencher campos que podem não existir em dados antigos (ex.: dar um `id` a pagamentos que não tinham, ou reconstruir a lista de categorias/tags a partir dos próprios livros, caso a lista solta esteja ausente).

### Criptografia

Cada seção é criptografada individualmente com **AES-GCM 256 bits**, chave derivada da senha local via **PBKDF2 (SHA-256, 150.000 iterações)**, salt aleatório de 16 bytes por operação, IV aleatório de 12 bytes. O blob salvo é um JSON simples:

```json
{ "v": 1, "salt": "<base64>", "iv": "<base64>", "data": "<base64>" }
```

A senha em si **nunca** é enviada nem armazenada em lugar nenhum — só existe em memória no navegador enquanto o app está desbloqueado (`senhaAtual`), e é usada para derivar a chave toda vez que algo precisa ser criptografado ou decifrado. Isso significa que o Firebase (o serviço, os administradores do projeto, um eventual vazamento de regras de segurança) nunca tem acesso aos dados em texto puro — só ao blob cifrado.

**Modo "sem senha"**: em vez de pedir uma senha real, o app usa uma passphrase fixa e pública embutida no código (`SEM_SENHA_PASSPHRASE`) como chave de criptografia. Os dados continuam tecnicamente cifrados no Firestore (formato idêntico), mas isso não protege contra nada — é só um jeito de manter a mesma pipeline de dados sem exigir que o usuário digite senha toda vez. Ativar/desativar esse modo re-criptografa todas as seções na hora (`reencriptarTudoCom`), trocando a senha real pela passphrase fixa ou vice-versa.

### Autenticação de acesso (separada da senha local)

A senha local protege o **conteúdo**; o Firebase Authentication (e-mail/senha) protege o **acesso de leitura/escrita** às coleções, quando as regras do Firestore exigem `request.auth != null`. São dois sistemas independentes — é possível, por exemplo, que alguém autenticado no Firebase ainda não consiga ler os dados de verdade sem a senha local.

Um detalhe de implementação que já causou bugs reais neste projeto: a leitura inicial do documento (para decidir se já existem dados salvos) só pode acontecer **depois** que o Firebase Auth termina de restaurar a sessão persistida do navegador — se disparar antes, cai em "permission denied" e o app erroneamente conclui que a biblioteca está vazia. A correção ficou em duas partes: (1) `aguardarAuthPronto` — espera o primeiro evento de `onAuthStateChanged` antes de tentar ler; (2) o efeito que carrega os dados também reage a mudanças em `statusAdminAuth`, então se o admin loga manualmente *depois* do carregamento inicial (ex.: sessão não persistida), o app tenta ler de novo automaticamente, em vez de ficar preso no estado de "sem dados".

### Sincronização em tempo real

Quando conectado a um projeto Firebase, cada seção é ouvida via `onSnapshot` — mudanças feitas em outro aparelho chegam automaticamente, sem polling. Um relógio local (`atualizadoEm` por seção) evita que o próprio aparelho reaja ao eco da sua própria escrita.

---

## Backups

Dois tipos, guardados na coleção `sifriyah_backups`, cada um com as mesmas 4 seções criptografadas de novo (com a senha do momento):

- **Automático**: disparado no máximo uma vez a cada 24h, checado a cada desbloqueio bem-sucedido do app (compara `Date.now()` contra o `criadoEm` do backup automático mais recente). Mantém no máximo `MAX_BACKUPS_AUTOMATICOS = 10` — ao ultrapassar, os mais antigos são apagados.
- **Manual**: disparado pelo botão em Ajustes, sem limite de quantidade — ficam retidos indefinidamente, servindo como "pontos de restauração" que o próprio usuário decide manter.

Restaurar (`restaurarBackup`) decifra as 4 seções do backup escolhido com a senha atual e substitui o estado em memória — os `useEffect` de autosave por seção então percebem a mudança e regravam tudo na nuvem sozinhos, sem passo manual adicional. Se a senha atual não bater com a que cifrou aquele backup (por exemplo, um backup de antes de uma troca de senha), a decodificação falha e isso é reportado na interface, em vez de falhar em silêncio.

---

## Pedidos vindos da vitrine pública: fila e reserva

A vitrine pública (`catalogo.html`) não escreve diretamente nas coleções privadas — ela só cria documentos avulsos em `sifriyah_pedidos_fila`, com um campo `tipo` (`"fila"` ou `"reserva"`) que os diferencia:

```
{ biblioteca, tipo, livroId, tituloLivro, codigoUsuario, nome, sobrenome, telefone,
  criadoEm, atendido, atendidoEm }
```

Quem visita o catálogo pode se identificar de duas formas: pelo `codigoUsuario` (se já é cadastrado) ou por nome + telefone (se ainda não é). O formulário é o mesmo para os dois tipos de pedido — só muda o rótulo do botão e o `tipo` gravado, conforme o livro esteja disponível (reserva) ou emprestado (fila).

No app administrativo, a aba **Fila** ouve essa coleção em tempo real e separa visualmente os dois tipos em duas listas. **Aceitar** um pedido tem efeito diferente conforme o tipo:
- **Fila**: tenta casar `codigoUsuario` com uma pessoa existente (ou o nome, se veio sem código); se achar, cria de verdade uma entrada na fila digital daquele livro (criando a pessoa também, se for a primeira vez que aparece); se não achar ninguém e não veio nome junto, mostra um erro em vez de falhar silenciosamente.
- **Reserva**: não existe um conceito de "reserva persistida" no sistema — aceitar só marca o pedido como atendido (o combinado de retirada é feito por fora, diretamente com a pessoa).

Pedidos atendidos não somem na hora — ficam guardados por 60 dias (limpeza automática, `nuvemLimparPedidosFilaAntigos`, rodada uma vez por sessão) como histórico de curto prazo, e só então são apagados de vez.

### Notificações

Usa a Notification API nativa do navegador — não é push (não funciona com o app fechado; exigiria um servidor e Firebase Cloud Messaging). Um `useRef` guarda os IDs dos pedidos vistos na última renderização; quando a lista de `pedidosFila` ganha um ID novo que não estava lá antes, e o usuário já concedeu permissão (`Notification.requestPermission`), dispara uma notificação do sistema operacional com o título do livro e o tipo de pedido. A aba "Fila" também mostra, sempre, um contador simples (`pedidosFila.length`) como badge — esse não depende de permissão nenhuma.

---

## Mensagens via WhatsApp

Todas as mensagens (confirmação de empréstimo, cobrança, lembrete de prazo, envio de código de usuário) são geradas client-side e abertas via link `https://wa.me/<telefone>?text=<mensagem>` — não há integração com a API oficial do WhatsApp, é só um deep link. Três dos quatro textos são editáveis pelo admin em Ajustes, com um pequeno mecanismo de template (`preencherModelo`): o texto guardado tem placeholders `{nome}`, `{livro}`, `{valor}`, `{prazo}`, `{dataInicio}`, `{dataFim}`, `{pix}`, substituídos por regex na hora de montar a mensagem final. Se o admin não personalizou um modelo, cada função tem um texto padrão embutido no código.

A mensagem de confirmação de empréstimo é a única que sempre aparece (não depende de haver saldo pendente); cobrança e lembrete de prazo só aparecem quando há algo a cobrar.

---

## Vitrine pública (`catalogo.html`)

Página HTML/JS solta, sem build, sem dependência de React — só o SDK compat do Firestore. Lê o documento único da coleção `sifriyah_publico` via `onSnapshot` (leitura pública, sem autenticação) e renderiza a lista inteira via `innerHTML` a cada mudança — não há diffing nem estado incremental, o DOM é reconstruído por completo a cada evento (o que também significa que qualquer formulário aberto no momento, como o de pedido de fila, colapsa de volta pro estado fechado).

A busca de texto livre casa contra título, autor, **nível de leitura e tags** — não só título/autor. Cada livro mostra também o valor semanal, quando cadastrado.

O documento público é escrito pelo app administrativo (`nuvemSalvarPublico`), com uma projeção deliberadamente reduzida dos dados reais — nem todo campo de um livro é publicado, e nenhum dado de pessoa, empréstimo ou financeiro sai daí. A escrita só acontece enquanto o app admin está desbloqueado e sincronizado (efeito guardado por `unlocked && senhaAtual && cloudConfig`).

Pré-cadastro (nome/telefone/e-mail, sem exigir login) grava em `sifriyah_precadastros` e aparece para revisão na aba Pessoas do admin, que pode "importar" (virar uma pessoa de verdade, com código de usuário gerado na hora) ou descartar.
