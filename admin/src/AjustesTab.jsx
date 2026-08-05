// ---------------- Ajustes ----------------
function AjustesTab({
  config,
  onChange,
  cloudConfig,
  cloudStatus,
  onConfigurarNuvem,
  onDesligarNuvem,
  ultimoSalvamento,
  ultimoBackup,
  backups,
  carregandoBackups,
  fazendoBackup,
  onFazerBackup,
  onAtualizarBackups,
  onRestaurarBackup,
  onApagarBackup,
  semSenha,
  onTrocarSenha,
  onDesativarSenha,
  onAtivarSenha,
  adminEmail,
  statusAdminAuth,
  onEntrarAdmin,
  onSairAdmin,
  notifPermitida,
  onPedirPermissaoNotificacao,
  livros,
  pessoas,
  emprestimos,
  livroById,
  pessoaById,
  totalPago,
  auditoria,
  carregandoAuditoria,
  onCarregarAuditoria,
}) {
  const [pix, setPix] = useState(config.pix || "");
  const [recebedor, setRecebedor] = useState(config.recebedor || "");
  const [whatsappContato, setWhatsappContato] = useState(config.whatsappContato || "");
  const [valorMultaSemanal, setValorMultaSemanal] = useState(config.valorMultaSemanal || "");
  const [maxBackupsAutomaticos, setMaxBackupsAutomaticos] = useState(config.maxBackupsAutomaticos || "");
  const [diasExpiracaoReserva, setDiasExpiracaoReserva] = useState(config.diasExpiracaoReserva || "");
  const [linkVitrine, setLinkVitrine] = useState(config.linkVitrine || "");
  const [promoAtiva, setPromoAtiva] = useState(config.promocao?.ativa || false);
  const [promoDescricao, setPromoDescricao] = useState(config.promocao?.descricao || "");
  const [promoValidoAte, setPromoValidoAte] = useState(config.promocao?.validoAte || "");
  const [promoDesconto, setPromoDesconto] = useState(config.promocao?.desconto || "");
  const MODELO_COBRANCA_PADRAO =
    'Oi {nome}! 👋 Passando pra lembrar sobre o livro "{livro}" que te emprestei — falta {valor} do combinado. {pix} Qualquer coisa me chama! 🙏';
  const MODELO_RENOVACAO_PADRAO =
    'Oi {nome}! 👋 Só passando pra saber sobre o livro "{livro}" — o prazo era {prazo}. Você já terminou ou quer renovar por mais um tempo? Me avisa 🙂';
  const MODELO_CONFIRMACAO_PADRAO =
    'Oi {nome}! 👋 Seu empréstimo do livro "{livro}" foi confirmado! Início: {dataInicio}. Devolução prevista: {dataFim}. Valor combinado: {valor}. Qualquer dúvida é só chamar 📚';
  const MODELO_RECIBO_PADRAO =
    'Oi {nome}! ✅ Recebido! O empréstimo do livro "{livro}" está quitado — valor total: {valor}. Muito obrigado! 📚';
  const [modeloCobranca, setModeloCobranca] = useState(config.modeloCobranca || MODELO_COBRANCA_PADRAO);
  const [modeloRenovacao, setModeloRenovacao] = useState(config.modeloRenovacao || MODELO_RENOVACAO_PADRAO);
  const [modeloConfirmacao, setModeloConfirmacao] = useState(config.modeloConfirmacao || MODELO_CONFIRMACAO_PADRAO);
  const [modeloRecibo, setModeloRecibo] = useState(config.modeloRecibo || MODELO_RECIBO_PADRAO);
  const [colado, setColado] = useState("");
  const [docId, setDocId] = useState(cloudConfig?.docId || "principal");
  const [erroNuvem, setErroNuvem] = useState("");
  const [emailAdminForm, setEmailAdminForm] = useState("");
  const [senhaAdminForm, setSenhaAdminForm] = useState("");
  const [erroAdmin, setErroAdmin] = useState("");
  const [entrandoAdmin, setEntrandoAdmin] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState(null);
  const [restauradoOk, setRestauradoOk] = useState(false);
  const [erroRestaurar, setErroRestaurar] = useState("");

  const [senhaAtualDigitada, setSenhaAtualDigitada] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState("");
  const [erroSenha, setErroSenha] = useState("");
  const [okSenha, setOkSenha] = useState("");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false);
  const [ativandoSenha, setAtivandoSenha] = useState(false);
  const [novaSenhaAtivar, setNovaSenhaAtivar] = useState("");
  const [confirmarSenhaAtivar, setConfirmarSenhaAtivar] = useState("");

  useEffect(() => {
    onAtualizarBackups();
    if (cloudConfig) onCarregarAuditoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestaurar(backup) {
    setRestaurandoId(backup.id);
    setRestauradoOk(false);
    setErroRestaurar("");
    try {
      await onRestaurarBackup(backup);
      setRestauradoOk(true);
    } catch (e) {
      console.error("Erro ao restaurar backup:", e);
      setErroRestaurar("Não consegui restaurar esse backup — a senha atual não decifra esses dados (provavelmente foi feito com outra senha). Fala com o suporte antes de tentar de novo.");
    }
    setRestaurandoId(null);
  }

  async function handleTrocarSenha() {
    setErroSenha("");
    setOkSenha("");
    if (novaSenha !== confirmarNovaSenha) {
      setErroSenha("As senhas não coincidem.");
      return;
    }
    setTrocandoSenha(true);
    const r = await onTrocarSenha(senhaAtualDigitada, novaSenha);
    setTrocandoSenha(false);
    if (r.ok) {
      setOkSenha("Senha alterada com sucesso.");
      setSenhaAtualDigitada("");
      setNovaSenha("");
      setConfirmarNovaSenha("");
    } else {
      setErroSenha(r.erro);
    }
  }

  async function handleDesativarSenha() {
    setTrocandoSenha(true);
    await onDesativarSenha();
    setTrocandoSenha(false);
    setConfirmandoDesativar(false);
  }

  async function handleAtivarSenha() {
    setErroSenha("");
    if (novaSenhaAtivar !== confirmarSenhaAtivar) {
      setErroSenha("As senhas não coincidem.");
      return;
    }
    setTrocandoSenha(true);
    const r = await onAtivarSenha(novaSenhaAtivar);
    setTrocandoSenha(false);
    if (r.ok) {
      setAtivandoSenha(false);
      setNovaSenhaAtivar("");
      setConfirmarSenhaAtivar("");
    } else {
      setErroSenha(r.erro);
    }
  }

  function salvarGeral() {
    onChange({
      pix,
      recebedor,
      whatsappContato,
      linkVitrine,
      valorMultaSemanal: valorMultaSemanal ? parseFloat(valorMultaSemanal) : 0,
      maxBackupsAutomaticos: maxBackupsAutomaticos ? parseInt(maxBackupsAutomaticos, 10) : 0,
      diasExpiracaoReserva: diasExpiracaoReserva ? parseInt(diasExpiracaoReserva, 10) : 0,
      promocao: {
        ativa: promoAtiva,
        descricao: promoDescricao,
        validoAte: promoValidoAte,
        desconto: promoDesconto ? parseFloat(promoDesconto) : 0,
      },
      modeloCobranca,
      modeloRenovacao,
      modeloConfirmacao,
      modeloRecibo,
    });
  }

  function exportarAcervoCSV() {
    const cabecalho = [
      "Título", "Autor", "Categoria", "Nível", "Unidades", "Valor semanal",
      "Valor semana extra", "Custo de reposição", "Páginas", "Adquirido em",
    ];
    const linhas = (livros || []).map((l) => [
      l.titulo, l.autor || "", l.categoria || "", l.nivel || "", l.quantidade || 1,
      l.valorSemanal || "", l.valorSemanaExtra || "", l.valorReposicao || "", l.paginas || "", l.dataAquisicao || "",
    ]);
    baixarCSV(`sifriyah-acervo-${todayISO()}.csv`, cabecalho, linhas);
  }

  function exportarPessoasCSV() {
    const cabecalho = ["Nome", "Sobrenome", "Telefone", "E-mail", "Código de usuário"];
    const linhas = (pessoas || []).map((p) => [p.nome, p.sobrenome || "", p.telefone || "", p.email || "", p.codigoUsuario || ""]);
    baixarCSV(`sifriyah-pessoas-${todayISO()}.csv`, cabecalho, linhas);
  }

  function exportarEmprestimosCSV() {
    const cabecalho = [
      "Livro", "Pessoa", "Data empréstimo", "Prazo", "Devolvido em", "Situação",
      "Valor combinado", "Total pago", "Status",
    ];
    const linhas = (emprestimos || []).map((e) => {
      const livro = livroById(e.livroId);
      const pessoa = pessoaById(e.pessoaId);
      return [
        livro ? livro.titulo : "(livro removido)",
        pessoa ? nomeCompleto(pessoa) : "(pessoa removida)",
        e.dataEmprestimo || "",
        e.prazo || "",
        e.dataDevolucao || "",
        e.statusFinal || (e.devolvido ? "devolvido" : ""),
        e.valorCombinado || 0,
        totalPago(e),
        e.devolvido ? "encerrado" : "ativo",
      ];
    });
    baixarCSV(`sifriyah-emprestimos-${todayISO()}.csv`, cabecalho, linhas);
  }

  function ativarNuvem() {
    setErroNuvem("");
    try {
      const obj = parseFirebaseConfigColado(colado);
      onConfigurarNuvem(obj, docId || "principal");
    } catch (e) {
      setErroNuvem("Não consegui ler essa configuração. Confere se colou o bloco inteiro do Firebase.");
    }
  }

  async function handleEntrarAdmin() {
    setErroAdmin("");
    setEntrandoAdmin(true);
    const r = await onEntrarAdmin(emailAdminForm, senhaAdminForm);
    setEntrandoAdmin(false);
    if (r.ok) {
      setSenhaAdminForm("");
    } else {
      setErroAdmin(r.erro);
    }
  }

  const statusLabel = {
    desligada: { texto: "desligada — salvando só neste aparelho", cor: COLORS.inkSoft },
    conectando: { texto: "conectando…", cor: COLORS.gold },
    sincronizada: { texto: "sincronizada com a nuvem ✓", cor: COLORS.sage },
    erro: { texto: "erro ao conectar — confere a configuração", cor: COLORS.rust },
    "sem-login": { texto: "sem permissão — entre com o login de administrador abaixo", cor: COLORS.rust },
  }[cloudStatus];

  return (
    <Section eyebrow="Cobrança" title="Ajustes">
      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <label style={labelStyle}>Chave Pix (aparece nas mensagens de cobrança)</label>
        <Input value={pix} onChange={(e) => setPix(e.target.value)} placeholder="ex: seuemail@email.com ou telefone" />
        <label style={labelStyle}>Nome do recebedor (opcional)</label>
        <Input value={recebedor} onChange={(e) => setRecebedor(e.target.value)} placeholder="ex: Weigler" />
        <label style={labelStyle}>Seu WhatsApp (contato geral — reservas e fila já não usam mais isso)</label>
        <Input value={whatsappContato} onChange={(e) => setWhatsappContato(e.target.value)} placeholder="(11) 91234-5678" />
        <label style={labelStyle}>Valor da multa por semana de atraso (opcional)</label>
        <Input
          type="number"
          step="0.01"
          value={valorMultaSemanal}
          onChange={(e) => setValorMultaSemanal(e.target.value)}
          placeholder="deixe em branco pra usar o valor da semana extra de cada livro"
        />
        <label style={labelStyle}>Quantos backups automáticos guardar (padrão: 10)</label>
        <Input
          type="number"
          min="1"
          value={maxBackupsAutomaticos}
          onChange={(e) => setMaxBackupsAutomaticos(e.target.value)}
          placeholder="10"
        />
        <label style={labelStyle}>Reserva expira sozinha depois de quantos dias sem retirada (padrão: 3)</label>
        <Input
          type="number"
          min="1"
          value={diasExpiracaoReserva}
          onChange={(e) => setDiasExpiracaoReserva(e.target.value)}
          placeholder="3"
        />
        <Button style={{ alignSelf: "flex-start" }} onClick={salvarGeral}>
          Salvar
        </Button>
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Notificações do navegador
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
          Avisa nesse navegador, na hora, quando chegar um pedido novo de fila ou reserva pela vitrine pública — só funciona enquanto essa aba estiver aberta.
        </div>
        {notifPermitida ? (
          <div style={{ fontSize: 13, color: COLORS.sage }}>✓ Notificações ativadas</div>
        ) : (
          <Button style={{ alignSelf: "flex-start" }} onClick={onPedirPermissaoNotificacao}>
            Ativar notificações
          </Button>
        )}
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Textos das mensagens
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
          Use <code>{"{nome}"}</code>, <code>{"{livro}"}</code>, <code>{"{prazo}"}</code>,{" "}
          <code>{"{dataInicio}"}</code>, <code>{"{dataFim}"}</code>, <code>{"{valor}"}</code> e{" "}
          <code>{"{pix}"}</code> — funcionam nos três textos abaixo, trocados automaticamente na hora de
          enviar. <code>{"{prazo}"}</code> e <code>{"{dataFim}"}</code> são a mesma data (a de devolução).{" "}
          <code>{"{valor}"}</code> muda de sentido conforme a mensagem: quanto ainda falta pagar na cobrança
          e no lembrete, e o valor combinado do empréstimo na confirmação.
        </div>
        <label style={labelStyle}>Mensagem de confirmação de empréstimo</label>
        <textarea
          value={modeloConfirmacao}
          onChange={(e) => setModeloConfirmacao(e.target.value)}
          rows={3}
          style={{ ...inputBase, fontFamily: "'Source Serif 4', serif" }}
        />
        <label style={labelStyle}>Mensagem de cobrança</label>
        <textarea
          value={modeloCobranca}
          onChange={(e) => setModeloCobranca(e.target.value)}
          rows={3}
          style={{ ...inputBase, fontFamily: "'Source Serif 4', serif" }}
        />
        <label style={labelStyle}>Mensagem de lembrete de prazo</label>
        <textarea
          value={modeloRenovacao}
          onChange={(e) => setModeloRenovacao(e.target.value)}
          rows={3}
          style={{ ...inputBase, fontFamily: "'Source Serif 4', serif" }}
        />
        <label style={labelStyle}>Mensagem de comprovante (enviada quando o empréstimo é quitado)</label>
        <textarea
          value={modeloRecibo}
          onChange={(e) => setModeloRecibo(e.target.value)}
          rows={3}
          style={{ ...inputBase, fontFamily: "'Source Serif 4', serif" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button style={{ alignSelf: "flex-start" }} onClick={salvarGeral}>
            Salvar textos
          </Button>
          <Button
            variant="ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              setModeloCobranca(MODELO_COBRANCA_PADRAO);
              setModeloRenovacao(MODELO_RENOVACAO_PADRAO);
              setModeloRecibo(MODELO_RECIBO_PADRAO);
            }}
          >
            Restaurar padrão
          </Button>
        </div>
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Promoção
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={promoAtiva} onChange={(e) => setPromoAtiva(e.target.checked)} />
          Promoção ativa (aparece pra você ao criar um empréstimo, e na vitrine pública)
        </label>
        <Input
          placeholder="ex: 50% de desconto em livros de teologia esse mês"
          value={promoDescricao}
          onChange={(e) => setPromoDescricao(e.target.value)}
        />
        <label style={labelStyle}>Desconto (%) — aplicado automaticamente no valor sugerido do empréstimo</label>
        <Input
          type="number"
          step="1"
          min="0"
          max="100"
          placeholder="ex: 50"
          value={promoDesconto}
          onChange={(e) => setPromoDesconto(e.target.value)}
        />
        <label style={labelStyle}>Válida até (opcional)</label>
        <Input type="date" value={promoValidoAte} onChange={(e) => setPromoValidoAte(e.target.value)} />
        <Button style={{ alignSelf: "flex-start" }} onClick={salvarGeral}>
          Salvar promoção
        </Button>
      </div>

      {cloudConfig && (
        <div
          style={{
            background: COLORS.card,
            border: `1.5px solid ${COLORS.rule}`,
            borderRadius: 10,
            padding: 16,
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
            Vitrine pública
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
            Página separada, sem senha, onde qualquer pessoa vê os livros disponíveis e pede reserva pelo seu WhatsApp.
            Ela atualiza sozinha sempre que você mexe no acervo.
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
            Código da biblioteca pra colar na vitrine pública (<code>catalogo/index.html</code>): <b>{cloudConfig.docId}</b>
          </div>

          <label style={labelStyle}>Link da vitrine (cole aqui pra gerar o QR code)</label>
          <Input
            value={linkVitrine}
            onChange={(e) => setLinkVitrine(e.target.value)}
            placeholder="https://weigler.github.io/sifriyah/catalogo/"
          />
          <Button style={{ alignSelf: "flex-start" }} onClick={salvarGeral}>
            Salvar link
          </Button>
          {linkVitrine && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(linkVitrine)}`}
                alt="QR code da vitrine pública"
                style={{ borderRadius: 8, border: `1.5px solid ${COLORS.rule}` }}
                width={180}
                height={180}
              />
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(linkVitrine)}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12.5, color: COLORS.burgundy }}
              >
                abrir em alta resolução pra imprimir
              </a>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Sincronização entre aparelhos
        </div>
        <div style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace", color: statusLabel.cor }}>
          {statusLabel.texto}
        </div>

        {!cloudConfig ? (
          <>
            <Button variant="ghost" style={{ alignSelf: "flex-start" }} onClick={() => onConfigurarNuvem(FIREBASE_CONFIG_PADRAO, DOC_ID_PADRAO)}>
              Reconectar à nuvem deste projeto
            </Button>
            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
              Ou, se for conectar a um projeto Firebase diferente (ex.: outra biblioteca):
            </div>
            <label style={labelStyle}>Cole aqui a configuração do Firebase (firebaseConfig)</label>
            <textarea
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  projectId: "...",\n  ...\n};`}
              rows={6}
              style={{ ...inputBase, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}
            />
            <label style={labelStyle}>Código da biblioteca (opcional, deixa "principal" se não souber)</label>
            <Input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="principal" />
            {erroNuvem && <div style={{ color: COLORS.rust, fontSize: 12.5 }}>{erroNuvem}</div>}
            <Button style={{ alignSelf: "flex-start" }} onClick={ativarNuvem}>
              Ativar sincronização
            </Button>
            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
              Repete esse mesmo passo (colando a mesma configuração e o mesmo código) nos outros aparelhos pra eles
              se conectarem à mesma biblioteca.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
              Projeto: <b>{cloudConfig.projectId}</b> · código: <b>{cloudConfig.docId}</b>
            </div>
            <Button variant="ghost" style={{ alignSelf: "flex-start" }} onClick={onDesligarNuvem}>
              Desligar sincronização
            </Button>
          </>
        )}
      </div>

      {cloudConfig && (
        <div
          style={{
            background: COLORS.card,
            border: `1.5px solid ${COLORS.rule}`,
            borderRadius: 10,
            padding: 16,
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
            Login de administrador
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
            Protege o Firestore de verdade — é diferente da senha do app (que só criptografa os dados). Precisa
            estar logado aqui pra sincronizar, ver e revisar pré-cadastros. Configure em Firebase Console →
            Authentication (veja as instruções que te passei).
          </div>
          {statusAdminAuth === "logado" ? (
            <>
              <div style={{ fontSize: 13, color: COLORS.sage }}>✓ Logado como {adminEmail}</div>
              <Button variant="ghost" style={{ alignSelf: "flex-start" }} onClick={onSairAdmin}>
                Sair
              </Button>
            </>
          ) : (
            <>
              <Input
                type="email"
                placeholder="E-mail de administrador"
                value={emailAdminForm}
                onChange={(e) => setEmailAdminForm(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Senha de administrador"
                value={senhaAdminForm}
                onChange={(e) => setSenhaAdminForm(e.target.value)}
              />
              {erroAdmin && <div style={{ fontSize: 12.5, color: COLORS.rust }}>{erroAdmin}</div>}
              <Button style={{ alignSelf: "flex-start" }} onClick={handleEntrarAdmin} disabled={entrandoAdmin}>
                {entrandoAdmin ? "Entrando…" : "Entrar"}
              </Button>
            </>
          )}
        </div>
      )}

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Backup e histórico de salvamento
        </div>

        <div style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace", color: COLORS.inkSoft, lineHeight: 1.7 }}>
          <div>{LABEL_SECAO.acervo}: salvo {fmtDataHora(ultimoSalvamento.acervo)}</div>
          <div>{LABEL_SECAO.pessoas}: salvo {fmtDataHora(ultimoSalvamento.pessoas)}</div>
          <div>{LABEL_SECAO.emprestimos}: salvo {fmtDataHora(ultimoSalvamento.emprestimos)}</div>
          <div>{LABEL_SECAO.ajustes}: salvo {fmtDataHora(ultimoSalvamento.ajustes)}</div>
        </div>

        <div style={{ height: 1, background: COLORS.rule, margin: "4px 0" }} />

        <div style={{ fontSize: 13.5 }}>
          Último backup: <b>{ultimoBackup ? fmtDataHora(ultimoBackup) : "nenhum ainda"}</b>
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
          Um backup automático é feito no máximo uma vez por dia, ao abrir o app. Você também pode fazer um manualmente
          quando quiser — por exemplo antes de usar dois aparelhos ao mesmo tempo.
        </div>
        <Button style={{ alignSelf: "flex-start" }} onClick={onFazerBackup} disabled={fazendoBackup}>
          {fazendoBackup ? "Fazendo backup…" : "Fazer backup agora"}
        </Button>

        <label style={{ ...labelStyle, marginTop: 6 }}>Backups disponíveis (acervo, pessoas, empréstimos e ajustes juntos)</label>
        {carregandoBackups && <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Carregando…</div>}
        {!carregandoBackups && backups.length === 0 && (
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Nenhum backup ainda.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
          {backups.map((b) => (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${COLORS.rule}`,
                borderRadius: 8,
                padding: "8px 10px",
                background: "#fff",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{fmtDataHora(b.criadoEm)}</div>
                <div style={{ fontSize: 11, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                  {b.tipo === "manual" ? "manual" : "automático"}
                </div>
              </div>
              {restaurandoId === b.id ? (
                <span style={{ fontSize: 12.5, color: COLORS.inkSoft }}>restaurando…</span>
              ) : (
                <BotaoExcluir label="restaurar" small onConfirm={() => handleRestaurar(b)} />
              )}
              <BotaoExcluir label="apagar" small onConfirm={() => onApagarBackup(b)} />
            </div>
          ))}
        </div>
        {restauradoOk && (
          <div style={{ fontSize: 12.5, color: COLORS.sage }}>
            ✓ Backup restaurado — os dados deste aparelho já foram atualizados.
          </div>
        )}
        {erroRestaurar && (
          <div style={{ fontSize: 12.5, color: COLORS.rust }}>{erroRestaurar}</div>
        )}
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Exportar dados
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
          Baixa uma planilha (CSV, abre no Excel/Google Sheets) com os dados de agora — diferente do
          backup criptografado, que só o próprio Sifriyah consegue reabrir.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="subtle" style={{ padding: "8px 12px", fontSize: 13 }} onClick={exportarAcervoCSV}>
            📥 Acervo (CSV)
          </Button>
          <Button variant="subtle" style={{ padding: "8px 12px", fontSize: 13 }} onClick={exportarPessoasCSV}>
            📥 Pessoas (CSV)
          </Button>
          <Button variant="subtle" style={{ padding: "8px 12px", fontSize: 13 }} onClick={exportarEmprestimosCSV}>
            📥 Empréstimos (CSV)
          </Button>
        </div>
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Log de auditoria
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
          Registro de ações importantes (quem fez o quê) — útil se mais de uma conta administra esta
          biblioteca. Só existe com a sincronização em nuvem ativada.
        </div>
        {!cloudConfig && (
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>
            Disponível só com a nuvem conectada (veja a seção "Sincronização entre aparelhos" acima).
          </div>
        )}
        {cloudConfig && (
          <>
            <Button
              variant="subtle"
              style={{ alignSelf: "flex-start", padding: "8px 12px", fontSize: 13 }}
              onClick={onCarregarAuditoria}
              disabled={carregandoAuditoria}
            >
              {carregandoAuditoria ? "Carregando…" : "Atualizar log"}
            </Button>
            {!carregandoAuditoria && auditoria.length === 0 && (
              <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>Nada registrado ainda.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
              {auditoria.map((a) => (
                <div
                  key={a.id}
                  style={{ border: `1px solid ${COLORS.rule}`, borderRadius: 8, padding: "8px 10px", background: "#fff", fontSize: 12.5 }}
                >
                  <div><b>{a.acao}</b>{a.detalhe ? " · " + a.detalhe : ""}</div>
                  <div style={{ fontSize: 11, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    {fmtDataHora(a.criadoEm)}{a.adminEmail ? " · " + a.adminEmail : ""}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>
          Senha de acesso
        </div>

        {semSenha ? (
          <>
            <div style={{ fontSize: 13, color: COLORS.inkSoft }}>
              Este app está funcionando <b>sem senha</b> — abre direto, sem pedir nada. Os dados continuam
              criptografados por baixo dos panos, mas com uma chave fixa que está no código público do app,
              então isso não protege as informações de quem tiver acesso ao Firestore.
            </div>
            {!ativandoSenha ? (
              <Button style={{ alignSelf: "flex-start" }} onClick={() => setAtivandoSenha(true)}>
                Ativar senha
              </Button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Input
                  type="password"
                  placeholder="Nova senha"
                  value={novaSenhaAtivar}
                  onChange={(e) => setNovaSenhaAtivar(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Confirme a nova senha"
                  value={confirmarSenhaAtivar}
                  onChange={(e) => setConfirmarSenhaAtivar(e.target.value)}
                />
                {erroSenha && <div style={{ fontSize: 12.5, color: COLORS.rust }}>{erroSenha}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={handleAtivarSenha} disabled={trocandoSenha}>
                    {trocandoSenha ? "Ativando…" : "Confirmar"}
                  </Button>
                  <Button variant="ghost" onClick={() => setAtivandoSenha(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <label style={labelStyle}>Trocar senha</label>
            <Input
              type="password"
              placeholder="Senha atual"
              value={senhaAtualDigitada}
              onChange={(e) => setSenhaAtualDigitada(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Nova senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirme a nova senha"
              value={confirmarNovaSenha}
              onChange={(e) => setConfirmarNovaSenha(e.target.value)}
            />
            {erroSenha && <div style={{ fontSize: 12.5, color: COLORS.rust }}>{erroSenha}</div>}
            {okSenha && <div style={{ fontSize: 12.5, color: COLORS.sage }}>{okSenha}</div>}
            <Button style={{ alignSelf: "flex-start" }} onClick={handleTrocarSenha} disabled={trocandoSenha}>
              {trocandoSenha ? "Trocando…" : "Trocar senha"}
            </Button>
            <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
              Isso já atualiza os backups existentes pra abrirem com a nova senha também. Em outros aparelhos
              conectados a esta biblioteca, você vai precisar digitar a nova senha também.
            </div>

            <div style={{ height: 1, background: COLORS.rule, margin: "4px 0" }} />

            <label style={labelStyle}>Usar sem senha</label>
            <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
              Desativa a tela de senha — o app abre direto em qualquer aparelho. Os dados (nomes, telefones,
              valores combinados) ficam bem menos protegidos caso alguém acesse o Firestore diretamente.
            </div>
            {!confirmandoDesativar ? (
              <Button variant="ghost" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmandoDesativar(true)}>
                Desativar senha
              </Button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: COLORS.rust }}>Tem certeza? Isso não protege mais os dados.</span>
                <Button
                  style={{ background: COLORS.rust, border: "none", color: "#fff" }}
                  onClick={handleDesativarSenha}
                  disabled={trocandoSenha}
                >
                  {trocandoSenha ? "Desativando…" : "Confirmar"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmandoDesativar(false)}>
                  Cancelar
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

