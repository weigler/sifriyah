function App() {
  useFonts();
  const [tab, setTab] = useState("emprestimos");
  const [livros, setLivros] = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [pessoas, setPessoas] = useState([]); // [{id, nome, sobrenome, telefone, email}]
  const [cobrancas, setCobrancas] = useState([]); // [{id, emprestimoId, tipo, data}]
  const [filas, setFilas] = useState([]); // [{id, livroId, pessoaId, criadoEm, ordem}]
  const [categorias, setCategorias] = useState([]);
  const [tags, setTags] = useState([]);
  const [config, setConfig] = useState({
    pix: "",
    recebedor: "",
    whatsappContato: "",
    linkVitrine: "",
    promocao: { ativa: false, descricao: "", validoAte: "", desconto: 0 },
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Nuvem (opcional) ----
  const [cloudConfig, setCloudConfigState] = useState(() => lerConfigNuvem());
  const [cloudDocId, setCloudDocId] = useState(() => lerConfigNuvem()?.docId || "principal");
  const [cloudStatus, setCloudStatus] = useState("desligada"); // desligada | conectando | sincronizada | erro | sem-login
  // guarda, por seção, o "atualizadoEm" que este aparelho já aplicou — serve pra:
  // 1) ignorar o eco do próprio salvamento quando o ouvinte em tempo real dispara
  // 2) aplicar só o que realmente é novidade vinda de outro aparelho
  const ultimosTimestampsRef = React.useRef({});

  // ---- Login de administrador (Firebase Authentication) — protege o Firestore de verdade;
  // é diferente da senha do app, que só criptografa/descriptografa os dados ----
  const [adminEmail, setAdminEmail] = useState(() => localStorage.getItem(ADMIN_EMAIL_KEY) || "");
  const [statusAdminAuth, setStatusAdminAuth] = useState("deslogado"); // deslogado | entrando | logado | erro

  useEffect(() => {
    if (!cloudConfig) return;
    let cancelado = false;
    obterFirebaseAuth(cloudConfig).then((auth) => {
      if (cancelado) return;
      auth.onAuthStateChanged((user) => {
        if (user) {
          setAdminEmail(user.email || "");
          localStorage.setItem(ADMIN_EMAIL_KEY, user.email || "");
          setStatusAdminAuth("logado");
        } else {
          setStatusAdminAuth("deslogado");
        }
      });
    });
    return () => {
      cancelado = true;
    };
  }, [cloudConfig]);

  async function entrarAdmin(email, senha) {
    if (!cloudConfig) return { ok: false, erro: "Conecte a nuvem primeiro." };
    setStatusAdminAuth("entrando");
    try {
      await entrarComoAdminNuvem(cloudConfig, email, senha);
      setStatusAdminAuth("logado");
      return { ok: true };
    } catch (e) {
      setStatusAdminAuth("erro");
      return { ok: false, erro: "E-mail ou senha incorretos." };
    }
  }
  async function sairAdmin() {
    if (!cloudConfig) return;
    await sairComoAdminNuvem(cloudConfig).catch(() => {});
    localStorage.removeItem(ADMIN_EMAIL_KEY);
    setAdminEmail("");
    setStatusAdminAuth("deslogado");
  }

  // busca as seções salvas (nuvem ou local) sem descriptografar — usado só pra saber se existe algo
  async function carregarSecoesBrutas() {
    if (cloudConfig) {
      await aguardarAuthPronto(cloudConfig);
      const doc = await nuvemLerDoc(cloudConfig, cloudDocId);
      if (!doc) return { secoes: {}, legado: null, semSenha: false };
      const secoes = {};
      SECOES.forEach((s) => {
        if (doc[s] && doc[s].blob) secoes[s] = doc[s];
      });
      return { secoes, legado: doc.blob || null, semSenha: !!doc.semSenha };
    }
    const secoes = {};
    for (const s of SECOES) {
      const res = await window.storage.get(`${STORAGE_KEY}__${s}`, false).catch(() => null);
      if (res && res.value) {
        try {
          const parsed = JSON.parse(res.value);
          if (parsed && parsed.blob) secoes[s] = parsed;
        } catch (e) {}
      }
    }
    const legadoRes = await window.storage.get(STORAGE_KEY, false).catch(() => null);
    const legado = legadoRes && legadoRes.value ? legadoRes.value : null;
    return { secoes, legado, semSenha: lerSemSenhaLocal() };
  }

  async function configurarNuvem(firebaseConfig, docId) {
    const cfg = { ...firebaseConfig, docId: docId || "principal" };
    if (unlocked) {
      // este aparelho já estava desbloqueado (às vezes com um estado vazio, criado só localmente).
      // antes de deixar esse estado ser salvo na nuvem, confere se essa biblioteca já tem dados reais —
      // se tiver, tranca de novo e pede a senha certa dessa biblioteca, em vez de arriscar sobrescrever.
      try {
        const doc = await nuvemLerDoc(cfg, cfg.docId);
        const temDadosNaNuvem = !!doc && (SECOES.some((s) => doc[s] && doc[s].blob) || !!doc.blob);
        if (temDadosNaNuvem) {
          setUnlocked(false);
          setSenhaAtual("");
        }
      } catch (e) {
        // não deu pra confirmar — mais seguro travar de novo do que arriscar
        setUnlocked(false);
        setSenhaAtual("");
      }
    }
    salvarConfigNuvem(cfg);
    setCloudConfigState(cfg);
    setCloudDocId(cfg.docId);
  }
  function desligarNuvem() {
    salvarConfigNuvem(null);
    setCloudConfigState(null);
  }

  // ---- Bloqueio por senha ----
  const [unlocked, setUnlocked] = useState(false);
  const [temDadosSalvos, setTemDadosSalvos] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState(""); // fica só na memória, nunca é salva
  const [semSenha, setSemSenha] = useState(false); // modo "sem senha" ativo pra essa biblioteca

  // ---- Histórico de salvamento e backups ----
  const [ultimoSalvamento, setUltimoSalvamento] = useState({}); // { acervo: ms, pessoas: ms, emprestimos: ms, ajustes: ms }
  const [ultimoBackup, setUltimoBackup] = useState(null);
  const [backups, setBackups] = useState([]);
  const [carregandoBackups, setCarregandoBackups] = useState(false);
  const [fazendoBackup, setFazendoBackup] = useState(false);

  // ---- Log de auditoria (opcional, só existe com nuvem conectada) ----
  const [auditoria, setAuditoria] = useState([]);
  const [carregandoAuditoria, setCarregandoAuditoria] = useState(false);
  async function carregarAuditoria() {
    if (!cloudConfig) return;
    setCarregandoAuditoria(true);
    try {
      setAuditoria(await nuvemListarAuditoria(cloudConfig, cloudDocId));
    } catch (e) {
      console.error("Erro ao carregar log de auditoria:", e);
    }
    setCarregandoAuditoria(false);
  }
  // registra uma linha no log de auditoria — silencioso e best-effort, nunca deve travar a ação
  // que está sendo registrada; só existe quando conectado à nuvem
  function auditar(acao, detalhe) {
    if (!cloudConfig) return;
    nuvemRegistrarAuditoria(cloudConfig, cloudDocId, acao, detalhe || "", adminEmail || "").catch((e) =>
      console.error("Erro ao registrar auditoria:", e)
    );
  }

  // expira reservas pendentes há mais de X dias sem retirada (configurável, padrão 3) — feito
  // uma vez por sessão, igual à limpeza de pedidos antigos já atendidos
  useEffect(() => {
    if (!cloudConfig || !unlocked) return;
    nuvemExpirarReservasAntigas(cloudConfig, cloudDocId, config.diasExpiracaoReserva).catch((e) =>
      console.error("Erro ao expirar reservas antigas:", e)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudConfig, cloudDocId, unlocked]);

  useEffect(() => {
    (async () => {
      setCloudStatus(cloudConfig ? "conectando" : "desligada");
      try {
        const { secoes, legado, semSenha: flagSemSenha } = await carregarSecoesBrutas();
        setTemDadosSalvos(Object.keys(secoes).length > 0 || !!legado);
        setSemSenha(flagSemSenha);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
        if (flagSemSenha) {
          // modo sem senha ativo: abre direto, sem pedir nada pro usuário
          await desbloquear(SEM_SENHA_PASSPHRASE);
        }
      } catch (e) {
        setTemDadosSalvos(false);
        setCloudStatus(cloudConfig ? statusParaErro(e) : "desligada");
      }
      setLoaded(true);
    })();
    // reage também a mudanças no login de admin: a primeira tentativa de leitura pode falhar
    // (permission-denied) se o app monta antes do admin logar — sem reagir a statusAdminAuth,
    // "temDadosSalvos" ficaria travado em falso pra sempre, mesmo depois do login funcionar
  }, [cloudConfig, cloudDocId, statusAdminAuth]);

  // recebe atualizações vindas de outros aparelhos em tempo real, seção por seção
  useEffect(() => {
    if (!cloudConfig || !unlocked || !senhaAtual) return;
    const parar = nuvemOuvir(cloudConfig, cloudDocId, async (secao, dado) => {
      if (!dado || !dado.blob || dado.atualizadoEm === ultimosTimestampsRef.current[secao]) return;
      try {
        const obj = await decryptJSON(dado.blob, senhaAtual);
        ultimosTimestampsRef.current[secao] = dado.atualizadoEm;
        setUltimoSalvamento((prev) => ({ ...prev, [secao]: dado.atualizadoEm }));
        if (secao === "acervo") {
          setLivros(obj.livros || []);
          setCategorias(obj.categorias || []);
          setTags(obj.tags || []);
        } else if (secao === "pessoas") {
          setPessoas(obj.pessoas || []);
        } else if (secao === "emprestimos") {
          setEmprestimos(obj.emprestimos || []);
          setCobrancas(obj.cobrancas || []);
          setFilas(obj.filas || []);
        } else if (secao === "ajustes") {
          setConfig(obj.config || {});
        }
      } catch (e) {
        // outro aparelho pode ter mandado com senha diferente; ignora silenciosamente
      }
    });
    return parar;
  }, [cloudConfig, cloudDocId, unlocked, senhaAtual]);

  // ---- Pré-cadastros enviados pela vitrine pública ----
  const [preCadastros, setPreCadastros] = useState([]);
  useEffect(() => {
    if (!cloudConfig || !unlocked) return;
    nuvemOuvirPreCadastros(cloudConfig, cloudDocId, setPreCadastros);
  }, [cloudConfig, cloudDocId, unlocked]);

  // uma vez por sessão, apaga pré-cadastros já aceitos há mais de 60 dias
  useEffect(() => {
    if (!cloudConfig || !unlocked) return;
    nuvemLimparPreCadastrosAntigos(cloudConfig, cloudDocId).catch((e) =>
      console.error("Erro ao limpar pré-cadastros antigos:", e)
    );
  }, [cloudConfig, cloudDocId, unlocked]);

  function importarPreCadastro(pc) {
    upsertPessoa({ nome: pc.nome || "", sobrenome: pc.sobrenome || "", telefone: pc.telefone || "", email: pc.email || "" });
    // marca como aceito em vez de apagar — fica guardado por 60 dias como comprovante
    nuvemMarcarAceitoPreCadastro(cloudConfig, pc.id).catch(() => {});
  }
  function descartarPreCadastro(pc) {
    nuvemRemoverPreCadastro(cloudConfig, pc.id).catch(() => {});
  }

  // ---- Pedidos vindos da vitrine pública: fila de espera (livro emprestado) e reserva (livro
  // disponível) — mesma coleção, diferenciados pelo campo "tipo" ----
  const [pedidosFila, setPedidosFila] = useState([]);
  useEffect(() => {
    if (!cloudConfig || !unlocked) return;
    nuvemOuvirPedidosFila(cloudConfig, cloudDocId, setPedidosFila);
  }, [cloudConfig, cloudDocId, unlocked]);

  // uma vez por sessão, apaga pedidos já atendidos há mais de 60 dias
  useEffect(() => {
    if (!cloudConfig || !unlocked) return;
    nuvemLimparPedidosFilaAntigos(cloudConfig, cloudDocId).catch((e) =>
      console.error("Erro ao limpar pedidos antigos:", e)
    );
  }, [cloudConfig, cloudDocId, unlocked]);

  // notifica (aviso do navegador) quando chega um pedido novo de fila/reserva, com a aba aberta
  const [notifPermitida, setNotifPermitida] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  async function pedirPermissaoNotificacao() {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setNotifPermitida(r === "granted");
  }
  const pedidosFilaAnterior = useRef(null);
  useEffect(() => {
    if (pedidosFilaAnterior.current === null) {
      pedidosFilaAnterior.current = pedidosFila.map((pf) => pf.id);
      return;
    }
    const idsAnteriores = new Set(pedidosFilaAnterior.current);
    const novos = pedidosFila.filter((pf) => !idsAnteriores.has(pf.id));
    if (novos.length > 0 && notifPermitida && typeof Notification !== "undefined") {
      novos.forEach((pf) => {
        try {
          new Notification(pf.tipo === "reserva" ? "Sifriyah — nova reserva" : "Sifriyah — novo pedido de fila", {
            body: pf.tituloLivro ? `${pf.tituloLivro}${pf.codigoUsuario ? " · " + pf.codigoUsuario : ""}` : "Você tem um novo pedido pendente.",
          });
        } catch (e) {
          // navegador pode bloquear silenciosamente — sem problema
        }
      });
    }
    pedidosFilaAnterior.current = pedidosFila.map((pf) => pf.id);
  }, [pedidosFila, notifPermitida]);

  // aceita um pedido de fila: acha a pessoa pelo código de usuário (ou pelo nome, se ela ainda
  // não tinha código) e coloca de verdade na fila do livro; se o código não bater com ninguém
  // e não veio nome junto, avisa em vez de falhar em silêncio. Pedidos de reserva não têm uma
  // "fila digital" própria — aceitar só marca como atendido (o combinado é falar com a pessoa)
  function aceitarPedidoFila(pf) {
    if (pf.tipo === "reserva") {
      nuvemMarcarAtendidoPedidoFila(cloudConfig, pf.id).catch(() => {});
      return { ok: true };
    }
    if (pf.tipo === "sugestao") {
      // sugestão de livro não vira nada automaticamente — "aceitar" só marca como vista;
      // se a biblioteca decidir comprar, o livro é cadastrado manualmente em Acervo
      nuvemMarcarAtendidoPedidoFila(cloudConfig, pf.id).catch(() => {});
      auditar("Sugestão de livro marcada como vista", pf.tituloLivro || "");
      return { ok: true };
    }
    let pessoa = pf.codigoUsuario
      ? pessoas.find((p) => (p.codigoUsuario || "").toUpperCase() === pf.codigoUsuario.toUpperCase())
      : null;
    if (!pessoa && pf.nome) {
      pessoa = pessoas.find(
        (p) => nomeCompleto(p).toLowerCase() === `${pf.nome} ${pf.sobrenome || ""}`.trim().toLowerCase()
      );
    }
    if (pessoa) {
      adicionarNaFila(pf.livroId, pessoa.id);
    } else if (pf.nome) {
      adicionarNaFila(pf.livroId, null, { nome: pf.nome || "", sobrenome: pf.sobrenome || "", telefone: pf.telefone || "" });
    } else {
      return { ok: false, erro: `Código "${pf.codigoUsuario}" não encontrado. Confira com a pessoa ou adicione manualmente pela aba Pessoas.` };
    }
    nuvemMarcarAtendidoPedidoFila(cloudConfig, pf.id).catch(() => {});
    return { ok: true };
  }
  function descartarPedidoFila(pf) {
    nuvemRemoverPedidoFila(cloudConfig, pf.id).catch(() => {});
  }

  async function desbloquear(senha) {
    const { secoes, legado } = await carregarSecoesBrutas();
    const temSecoesNovas = Object.keys(secoes).length > 0;
    if (!temSecoesNovas && !legado) {
      setSenhaAtual(senha);
      setUnlocked(true);
      return { ok: true };
    }
    try {
      let m;
      if (temSecoesNovas) {
        // formato novo (já separado por seção)
        const decodificado = {};
        const timestamps = {};
        for (const s of SECOES) {
          if (secoes[s]) {
            decodificado[s] = await decryptJSON(secoes[s].blob, senha);
            timestamps[s] = secoes[s].atualizadoEm;
            ultimosTimestampsRef.current[s] = secoes[s].atualizadoEm;
          }
        }
        m = migrarDados(combinarSecoes(decodificado));
        setUltimoSalvamento((prev) => ({ ...prev, ...timestamps }));
      } else {
        // formato antigo (um blob só) — migra pro formato novo automaticamente
        const parsed = await decryptJSON(legado, senha);
        m = migrarDados(parsed);
      }
      setLivros(m.livros);
      setEmprestimos(m.emprestimos);
      setPessoas(m.pessoas);
      setCobrancas(m.cobrancas);
      setFilas(m.filas || []);
      setCategorias(m.categorias);
      setTags(m.tags);
      setConfig(m.config);
      setSenhaAtual(senha);
      setUnlocked(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: "Senha incorreta." };
    }
  }

  function bloquear() {
    setSenhaAtual("");
    setUnlocked(false);
  }

  async function apagarTudoEComecarDeNovo() {
    auditar("Todos os dados apagados (reset)", "");
    const agora = Date.now();
    for (const s of SECOES) {
      ultimosTimestampsRef.current[s] = agora;
      if (cloudConfig) {
        await nuvemSalvarSecao(cloudConfig, cloudDocId, s, "", agora);
      } else {
        await window.storage.set(`${STORAGE_KEY}__${s}`, JSON.stringify({ blob: "", atualizadoEm: agora }), false);
      }
    }
    if (cloudConfig) {
      const db = await inicializarFirebase(cloudConfig);
      await db.collection("sifriyah").doc(cloudDocId).set({ blob: "", semSenha: false }, { merge: true }); // limpa o formato antigo também
    } else {
      await window.storage.set(STORAGE_KEY, "", false); // limpa o formato antigo também
      salvarSemSenhaLocal(false);
    }
    setLivros([]);
    setEmprestimos([]);
    setPessoas([]);
    setCobrancas([]);
    setFilas([]);
    setCategorias([]);
    setTags([]);
    setConfig({ pix: "", recebedor: "", whatsappContato: "", linkVitrine: "", promocao: { ativa: false, descricao: "", validoAte: "", desconto: 0 } });
    setSenhaAtual("");
    setSemSenha(false);
    setUnlocked(false);
    setTemDadosSalvos(false);
    // os backups já feitos NÃO são apagados — servem de rede de segurança caso o reset tenha sido engano
  }

  // grava uma seção (local ou nuvem), atualizando o registro de "última vez salva"
  async function salvarSecao(secao, dadosSecao, senhaParaUsar) {
    const blob = await encryptJSON(dadosSecao, senhaParaUsar || senhaAtual);
    const agora = Date.now();
    ultimosTimestampsRef.current[secao] = agora;
    if (cloudConfig) {
      await nuvemSalvarSecao(cloudConfig, cloudDocId, secao, blob, agora);
    } else {
      await window.storage.set(`${STORAGE_KEY}__${secao}`, JSON.stringify({ blob, atualizadoEm: agora }), false);
    }
    setUltimoSalvamento((prev) => ({ ...prev, [secao]: agora }));
    return agora;
  }

  // salvamento automático — uma seção só é regravada quando os dados dela mudam,
  // então editar Pessoas não toca em Acervo/Empréstimos/Ajustes (e vice-versa)
  const salvandoContagemRef = React.useRef(0);
  function iniciarSalvando() {
    salvandoContagemRef.current += 1;
    setSaving(true);
  }
  function terminarSalvando() {
    salvandoContagemRef.current = Math.max(0, salvandoContagemRef.current - 1);
    if (salvandoContagemRef.current === 0) setSaving(false);
  }

  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual) return;
    iniciarSalvando();
    let concluido = false;
    const t = setTimeout(async () => {
      try {
        await salvarSecao("acervo", { livros, categorias, tags });
        setTemDadosSalvos(true);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
      } catch (e) {
        console.error("Erro ao salvar acervo:", e);
        setCloudStatus(cloudConfig ? statusParaErro(e) : "desligada");
      }
      concluido = true;
      terminarSalvando();
    }, 400);
    return () => {
      clearTimeout(t);
      if (!concluido) terminarSalvando();
    };
  }, [livros, categorias, tags, loaded, unlocked, senhaAtual, cloudConfig, cloudDocId]);

  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual) return;
    iniciarSalvando();
    let concluido = false;
    const t = setTimeout(async () => {
      try {
        await salvarSecao("pessoas", { pessoas });
        setTemDadosSalvos(true);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
      } catch (e) {
        console.error("Erro ao salvar pessoas:", e);
        setCloudStatus(cloudConfig ? statusParaErro(e) : "desligada");
      }
      concluido = true;
      terminarSalvando();
    }, 400);
    return () => {
      clearTimeout(t);
      if (!concluido) terminarSalvando();
    };
  }, [pessoas, loaded, unlocked, senhaAtual, cloudConfig, cloudDocId]);

  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual) return;
    iniciarSalvando();
    let concluido = false;
    const t = setTimeout(async () => {
      try {
        await salvarSecao("emprestimos", { emprestimos, cobrancas, filas });
        setTemDadosSalvos(true);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
      } catch (e) {
        console.error("Erro ao salvar empréstimos:", e);
        setCloudStatus(cloudConfig ? statusParaErro(e) : "desligada");
      }
      concluido = true;
      terminarSalvando();
    }, 400);
    return () => {
      clearTimeout(t);
      if (!concluido) terminarSalvando();
    };
  }, [emprestimos, cobrancas, filas, loaded, unlocked, senhaAtual, cloudConfig, cloudDocId]);

  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual) return;
    iniciarSalvando();
    let concluido = false;
    const t = setTimeout(async () => {
      try {
        await salvarSecao("ajustes", { config });
        setTemDadosSalvos(true);
        setCloudStatus(cloudConfig ? "sincronizada" : "desligada");
      } catch (e) {
        console.error("Erro ao salvar ajustes:", e);
        setCloudStatus(cloudConfig ? statusParaErro(e) : "desligada");
      }
      concluido = true;
      terminarSalvando();
    }, 400);
    return () => {
      clearTimeout(t);
      if (!concluido) terminarSalvando();
    };
  }, [config, loaded, unlocked, senhaAtual, cloudConfig, cloudDocId]);

  // atualiza a vitrine pública (não depende do salvamento por seção)
  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual || !cloudConfig) return;
    const t = setTimeout(async () => {
      try {
        const emprestimosAtivos = emprestimos.filter((e) => !e.devolvido);
        const dadosPublicos = {
          bibliotecaNome: APP_NAME,
          whatsappContato: config.whatsappContato || "",
          promocao: config.promocao?.ativa ? config.promocao : null,
          livros: livros.map((l) => {
            const ativos = emprestimosAtivos.filter((e) => e.livroId === l.id);
            const quantidade = l.quantidade || 1;
            const disponivel = ativos.length < quantidade;
            const proximaData = disponivel
              ? null
              : ativos.reduce((menor, e) => (!menor || (e.prazo && e.prazo < menor) ? e.prazo : menor), null);
            return {
              id: l.id,
              titulo: l.titulo,
              autor: l.autor || "",
              capaUrl: l.capaUrl || null,
              paginas: l.paginas || null,
              categoria: l.categoria || "",
              nivel: l.nivel || "",
              sinopse: l.sinopse || "",
              linkExterno: l.linkExterno || "",
              tags: l.tags || [],
              valorSemanal: l.valorSemanal || null,
              disponivel,
              proximaData,
            };
          }),
        };
        await nuvemSalvarPublico(cloudConfig, cloudDocId, dadosPublicos);
      } catch (e) {
        console.error("Erro ao salvar vitrine pública:", e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [livros, emprestimos, config, loaded, unlocked, senhaAtual, cloudConfig, cloudDocId]);

  // ---- Backups ----
  async function listarBackups() {
    if (cloudConfig) return await nuvemListarBackups(cloudConfig, cloudDocId);
    return await localListarBackups();
  }

  async function atualizarListaBackups() {
    setCarregandoBackups(true);
    try {
      const lista = await listarBackups();
      setBackups(lista);
      if (lista[0]) setUltimoBackup(lista[0].criadoEm);
    } catch (e) {
      console.error("Erro ao listar backups:", e);
    }
    setCarregandoBackups(false);
  }

  async function fazerBackup(tipo) {
    const maxAutomaticos = config.maxBackupsAutomaticos || MAX_BACKUPS_AUTOMATICOS_PADRAO;
    const secoesAtuais = montarSecoes({ livros, categorias, tags, pessoas, emprestimos, cobrancas, filas, config });
    const blobsPorSecao = {};
    for (const s of SECOES) {
      blobsPorSecao[s] = await encryptJSON(secoesAtuais[s], senhaAtual);
    }
    const criadoEm = Date.now();
    if (cloudConfig) {
      await nuvemSalvarBackup(cloudConfig, cloudDocId, tipo, blobsPorSecao, criadoEm);
      if (tipo === "automatico") {
        const lista = await nuvemListarBackups(cloudConfig, cloudDocId);
        const automaticos = lista.filter((b) => b.tipo === "automatico");
        if (automaticos.length > maxAutomaticos) {
          for (const b of automaticos.slice(maxAutomaticos)) {
            await nuvemApagarBackup(cloudConfig, b.id).catch(() => {});
          }
        }
      }
    } else {
      const lista = await localListarBackups();
      const novoItem = { id: uid(), tipo, criadoEm, secoes: blobsPorSecao };
      const manuais = lista.filter((b) => b.tipo === "manual");
      const automaticos = lista.filter((b) => b.tipo === "automatico");
      const listaAtualizada =
        tipo === "manual"
          ? [novoItem, ...manuais, ...automaticos.slice(0, maxAutomaticos)]
          : [...manuais, novoItem, ...automaticos].slice(0, manuais.length + maxAutomaticos);
      listaAtualizada.sort((a, b) => b.criadoEm - a.criadoEm);
      await localSalvarListaBackups(listaAtualizada);
    }
    setUltimoBackup(criadoEm);
    await atualizarListaBackups();
    return criadoEm;
  }

  async function handleFazerBackupManual() {
    setFazendoBackup(true);
    try {
      await fazerBackup("manual");
    } catch (e) {
      console.error("Erro ao fazer backup:", e);
    }
    setFazendoBackup(false);
  }

  async function restaurarBackup(backup) {
    auditar("Backup restaurado", `feito em ${fmtDataHora(backup.criadoEm)} (${backup.tipo || "?"})`);
    const decodificado = {};
    for (const s of SECOES) {
      if (backup.secoes[s]) {
        decodificado[s] = await decryptJSON(backup.secoes[s], senhaAtual);
      }
    }
    const m = migrarDados(combinarSecoes(decodificado));
    setLivros(m.livros);
    setEmprestimos(m.emprestimos);
    setPessoas(m.pessoas);
    setCobrancas(m.cobrancas);
    setFilas(m.filas || []);
    setCategorias(m.categorias);
    setTags(m.tags);
    setConfig(m.config);
    // os useEffect de salvamento por seção cuidam de gravar esses dados restaurados automaticamente
  }

  async function apagarBackup(backup) {
    if (cloudConfig) {
      await nuvemApagarBackup(cloudConfig, backup.id);
    } else {
      const lista = await localListarBackups();
      await localSalvarListaBackups(lista.filter((b) => b.id !== backup.id));
    }
    await atualizarListaBackups();
  }

  // ---- Trocar senha / ativar-desativar o modo "sem senha" ----
  async function atualizarBlobsBackup(backup, novosBlobsSecao) {
    if (cloudConfig) {
      const db = await inicializarFirebase(cloudConfig);
      await db.collection("sifriyah_backups").doc(backup.id).set({ secoes: novosBlobsSecao }, { merge: true });
    } else {
      const lista = await localListarBackups();
      const atualizada = lista.map((b) => (b.id === backup.id ? { ...b, secoes: novosBlobsSecao } : b));
      await localSalvarListaBackups(atualizada);
    }
  }

  // re-criptografa as 4 seções e todos os backups já existentes com uma nova senha/frase —
  // usado tanto pra trocar de senha quanto pra ativar/desativar o modo sem senha
  async function reencriptarTudoCom(senhaAntiga, senhaNova) {
    const secoesAtuais = montarSecoes({ livros, categorias, tags, pessoas, emprestimos, cobrancas, filas, config });
    for (const s of SECOES) {
      await salvarSecao(s, secoesAtuais[s], senhaNova);
    }
    const lista = await listarBackups();
    for (const b of lista) {
      const decodificado = {};
      for (const s of SECOES) {
        if (b.secoes[s]) {
          try {
            decodificado[s] = await decryptJSON(b.secoes[s], senhaAntiga);
          } catch (e) {
            // esse backup específico não abriu com a senha informada — pula, sem travar os demais
          }
        }
      }
      const novosBlobs = {};
      for (const s of SECOES) {
        if (decodificado[s] !== undefined) novosBlobs[s] = await encryptJSON(decodificado[s], senhaNova);
      }
      if (Object.keys(novosBlobs).length > 0) await atualizarBlobsBackup(b, novosBlobs);
    }
  }

  async function trocarSenha(senhaAtualDigitada, novaSenha) {
    if (senhaAtualDigitada !== senhaAtual) {
      return { ok: false, erro: "A senha atual não confere." };
    }
    if (!novaSenha || novaSenha.length < 4) {
      return { ok: false, erro: "A nova senha precisa ter pelo menos 4 caracteres." };
    }
    try {
      await reencriptarTudoCom(senhaAtual, novaSenha);
      setSenhaAtual(novaSenha);
      auditar("Senha do app alterada", "");
      return { ok: true };
    } catch (e) {
      console.error("Erro ao trocar senha:", e);
      return { ok: false, erro: "Não deu pra trocar a senha. Tenta de novo." };
    }
  }

  // desliga a proteção por senha: re-criptografa tudo com a frase-senha fixa (não secreta,
  // ver comentário perto de SEM_SENHA_PASSPHRASE) e marca o modo como ativo
  async function desativarSenha() {
    try {
      await reencriptarTudoCom(senhaAtual, SEM_SENHA_PASSPHRASE);
      if (cloudConfig) {
        const db = await inicializarFirebase(cloudConfig);
        await db.collection("sifriyah").doc(cloudDocId).set({ semSenha: true }, { merge: true });
      } else {
        salvarSemSenhaLocal(true);
      }
      setSenhaAtual(SEM_SENHA_PASSPHRASE);
      setSemSenha(true);
      setUnlocked(true);
      return { ok: true };
    } catch (e) {
      console.error("Erro ao desativar senha:", e);
      return { ok: false, erro: "Não deu pra desativar a senha. Tenta de novo." };
    }
  }

  // volta a exigir senha: re-criptografa tudo com a nova senha escolhida agora
  async function ativarSenha(novaSenha) {
    if (!novaSenha || novaSenha.length < 4) {
      return { ok: false, erro: "Use pelo menos 4 caracteres." };
    }
    try {
      await reencriptarTudoCom(senhaAtual, novaSenha);
      if (cloudConfig) {
        const db = await inicializarFirebase(cloudConfig);
        await db.collection("sifriyah").doc(cloudDocId).set({ semSenha: false }, { merge: true });
      } else {
        salvarSemSenhaLocal(false);
      }
      setSenhaAtual(novaSenha);
      setSemSenha(false);
      return { ok: true };
    } catch (e) {
      console.error("Erro ao ativar senha:", e);
      return { ok: false, erro: "Não deu pra ativar a senha. Tenta de novo." };
    }
  }

  // confere uma vez por desbloqueio se já passou mais de 24h desde o último backup;
  // se sim (ou se nunca houve nenhum), faz um backup automático
  useEffect(() => {
    if (!loaded || !unlocked || !senhaAtual) return;
    (async () => {
      try {
        const lista = await listarBackups();
        setBackups(lista);
        const maisRecente = lista[0];
        if (maisRecente) setUltimoBackup(maisRecente.criadoEm);
        const precisaBackup = !maisRecente || Date.now() - maisRecente.criadoEm > 24 * 60 * 60 * 1000;
        if (precisaBackup) await fazerBackup("automatico");
      } catch (e) {
        console.error("Erro ao checar backup automático:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, senhaAtual, loaded]);

  function livroById(id) {
    return livros.find((l) => l.id === id);
  }
  function pessoaById(id) {
    return pessoas.find((p) => p.id === id);
  }
  function pessoaPorNomeCompleto(nomeFull) {
    return pessoas.find((p) => nomeCompleto(p).toLowerCase() === (nomeFull || "").trim().toLowerCase());
  }

  function statusOf(emp) {
    if (emp.devolvido) return emp.statusFinal || "devolvido";
    if (emp.prazo && daysBetween(emp.prazo) > 0) return "atrasado";
    return "emprestado";
  }

  function totalPago(emp) {
    return (emp.pagamentos || []).reduce((s, p) => s + p.valor, 0);
  }

  // ---- Ações: Livros ----
  function addLivro(dados) {
    if (!dados.titulo.trim() || !(dados.autor || "").trim()) return;
    setLivros((prev) => [
      ...prev,
      {
        id: uid(),
        titulo: dados.titulo.trim(),
        autor: (dados.autor || "").trim(),
        paginas: dados.paginas ? parseInt(dados.paginas, 10) : null,
        dataAquisicao: dados.dataAquisicao || null,
        capaUrl: dados.capaUrl || null,
        valorSemanal: dados.valorSemanal ? parseFloat(dados.valorSemanal) : null,
        valorSemanaExtra: dados.valorSemanaExtra ? parseFloat(dados.valorSemanaExtra) : null,
        valorReposicao: dados.valorReposicao ? parseFloat(dados.valorReposicao) : null,
        limiteSemanas: dados.limiteSemanas ? parseInt(dados.limiteSemanas, 10) : null,
        categoria: (dados.categoria || "").trim(),
        tags: dados.tags || [],
        quantidade: dados.quantidade ? Math.max(1, parseInt(dados.quantidade, 10)) : 1,
        nivel: dados.nivel || "",
        sinopse: (dados.sinopse || "").trim(),
        linkExterno: (dados.linkExterno || "").trim(),
      },
    ]);
  }

  function editarLivro(id, dados) {
    if (!dados.titulo.trim() || !(dados.autor || "").trim()) return;
    setLivros((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              titulo: dados.titulo.trim(),
              autor: (dados.autor || "").trim(),
              paginas: dados.paginas ? parseInt(dados.paginas, 10) : null,
              dataAquisicao: dados.dataAquisicao || null,
              capaUrl: dados.capaUrl || null,
              valorSemanal: dados.valorSemanal ? parseFloat(dados.valorSemanal) : null,
              valorSemanaExtra: dados.valorSemanaExtra ? parseFloat(dados.valorSemanaExtra) : null,
              valorReposicao: dados.valorReposicao ? parseFloat(dados.valorReposicao) : null,
              limiteSemanas: dados.limiteSemanas ? parseInt(dados.limiteSemanas, 10) : null,
              categoria: (dados.categoria || "").trim(),
              tags: dados.tags || [],
              quantidade: dados.quantidade ? Math.max(1, parseInt(dados.quantidade, 10)) : 1,
              nivel: dados.nivel || "",
              sinopse: (dados.sinopse || "").trim(),
              linkExterno: (dados.linkExterno || "").trim(),
            }
          : l
      )
    );
  }

  function removeLivro(id) {
    const l = livroById(id);
    setLivros((prev) => prev.filter((x) => x.id !== id));
    if (l) auditar("Livro removido do acervo", l.titulo);
  }

  // ---- Ações: Pessoas ----
  function upsertPessoa(dados, id) {
    setPessoas((prev) => {
      if (id) return prev.map((p) => (p.id === id ? { ...p, ...dados } : p));
      // evita duplicar se já existe alguém com o mesmo nome completo
      const existente = prev.find(
        (p) => nomeCompleto(p).toLowerCase() === nomeCompleto(dados).toLowerCase()
      );
      if (existente) return prev.map((p) => (p.id === existente.id ? { ...p, ...dados } : p));
      const codigoUsuario = gerarCodigoUsuario(prev.map((p) => p.codigoUsuario));
      return [...prev, { id: uid(), nome: "", sobrenome: "", telefone: "", email: "", codigoUsuario, ...dados }];
    });
  }
  function regerarCodigoPessoa(id) {
    setPessoas((prev) => {
      const codigo = gerarCodigoUsuario(prev.map((p) => p.codigoUsuario));
      return prev.map((p) => (p.id === id ? { ...p, codigoUsuario: codigo } : p));
    });
  }
  function removePessoa(id) {
    const p = pessoaById(id);
    setPessoas((prev) => prev.filter((x) => x.id !== id));
    if (p) auditar("Pessoa removida", nomeCompleto(p));
  }

  // ---- Ações: Empréstimos ----
  function addEmprestimo(data) {
    if (!data.livroId || !data.prazo) return;
    let pessoaId = data.pessoaId;
    if (!pessoaId && data.pessoaNovaNome) {
      pessoaId = uid();
      setPessoas((prev) => [
        ...prev,
        {
          id: pessoaId,
          nome: data.pessoaNovaNome.trim(),
          sobrenome: (data.pessoaNovaSobrenome || "").trim(),
          telefone: data.telefone || "",
          email: "",
          codigoUsuario: gerarCodigoUsuario(prev.map((p) => p.codigoUsuario)),
        },
      ]);
    }
    setEmprestimos((prev) => [
      {
        id: uid(),
        livroId: data.livroId,
        pessoaId,
        dataEmprestimo: todayISO(),
        prazo: data.prazo || null,
        valorCombinado: parseFloat(data.valorCombinado) || 0,
        pagamentos: [],
        devolvido: false,
        dataDevolucao: null,
      },
      ...prev,
    ]);
    // se essa pessoa estava na fila de espera desse livro, já sai da fila (pegou o livro agora)
    setFilas((prev) => prev.filter((f) => !(f.livroId === data.livroId && f.pessoaId === pessoaId)));

    const livroTitulo = livroById(data.livroId)?.titulo || "livro removido";
    const pessoaNome = pessoaId ? pessoaById(pessoaId)?.nome || data.pessoaNovaNome || "" : data.pessoaNovaNome || "";
    auditar("Empréstimo registrado", `${livroTitulo}${pessoaNome ? " · " + pessoaNome : ""}`);
  }

  // ---- Fila de espera por livro ----
  function adicionarNaFila(livroId, pessoaId, dadosNovaPessoa) {
    let pid = pessoaId;
    if (!pid && dadosNovaPessoa && dadosNovaPessoa.nome && dadosNovaPessoa.nome.trim()) {
      pid = uid();
      setPessoas((prev) => [
        ...prev,
        {
          id: pid,
          nome: dadosNovaPessoa.nome.trim(),
          sobrenome: (dadosNovaPessoa.sobrenome || "").trim(),
          telefone: dadosNovaPessoa.telefone || "",
          email: "",
          codigoUsuario: gerarCodigoUsuario(prev.map((p) => p.codigoUsuario)),
        },
      ]);
    }
    if (!pid) return;
    // evita duplicar a mesma pessoa na fila do mesmo livro
    setFilas((prev) =>
      prev.some((f) => f.livroId === livroId && f.pessoaId === pid)
        ? prev
        : [...prev, { id: uid(), livroId, pessoaId: pid, criadoEm: Date.now() }]
    );
  }
  function removerDaFila(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }
  // troca a posição de uma entrada com a vizinha (dentro da fila do mesmo livro), pra cima ou pra baixo
  function moverNaFila(id, direcao) {
    setFilas((prev) => {
      const entrada = prev.find((f) => f.id === id);
      if (!entrada) return prev;
      const doMesmoLivro = prev
        .filter((f) => f.livroId === entrada.livroId)
        .sort((a, b) => (a.ordem ?? a.criadoEm) - (b.ordem ?? b.criadoEm));
      const pos = doMesmoLivro.findIndex((f) => f.id === id);
      const novaPos = pos + direcao;
      if (novaPos < 0 || novaPos >= doMesmoLivro.length) return prev;
      const vizinho = doMesmoLivro[novaPos];
      const ordemEntrada = entrada.ordem ?? entrada.criadoEm;
      const ordemVizinho = vizinho.ordem ?? vizinho.criadoEm;
      return prev.map((f) => {
        if (f.id === entrada.id) return { ...f, ordem: ordemVizinho };
        if (f.id === vizinho.id) return { ...f, ordem: ordemEntrada };
        return f;
      });
    });
  }

  function marcarDevolvido(id, desconto) {
    const abatimento = parseFloat(desconto) || 0;
    const emp = emprestimos.find((e) => e.id === id);
    setEmprestimos((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              devolvido: true,
              dataDevolucao: todayISO(),
              valorCombinado: abatimento > 0 ? Math.max(0, (e.valorCombinado || 0) - abatimento) : e.valorCombinado,
            }
          : e
      )
    );
    if (emp) {
      const livro = livroById(emp.livroId);
      const pessoa = pessoaById(emp.pessoaId);
      auditar("Devolução registrada", `${livro ? livro.titulo : "livro removido"} · ${pessoa ? nomeCompleto(pessoa) : "pessoa removida"}`);
    }
  }

  // registra um exemplar como perdido ou danificado: encerra o empréstimo (igual devolver), soma
  // o custo de reposição ao valor devido pela pessoa (reaproveitando o mecanismo de dívida já
  // existente, sem precisar de um cálculo separado) e tira uma unidade do acervo desse livro
  function marcarPerdidoDanificado(id, tipo, custoReposicao) {
    const custo = parseFloat(custoReposicao) || 0;
    const emp = emprestimos.find((e) => e.id === id);
    setEmprestimos((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              devolvido: true,
              dataDevolucao: todayISO(),
              statusFinal: tipo, // "perdido" | "danificado"
              custoReposicao: custo,
              valorCombinado: (e.valorCombinado || 0) + custo,
            }
          : e
      )
    );
    if (emp) {
      setLivros((prev) =>
        prev.map((l) => (l.id === emp.livroId ? { ...l, quantidade: Math.max(0, (l.quantidade || 1) - 1) } : l))
      );
      const livro = livroById(emp.livroId);
      const pessoa = pessoaById(emp.pessoaId);
      auditar(
        tipo === "perdido" ? "Livro marcado como perdido" : "Livro marcado como danificado",
        `${livro ? livro.titulo : "livro removido"} · ${pessoa ? nomeCompleto(pessoa) : "pessoa removida"} · custo: ${fmtMoney(custo)}`
      );
    }
  }

  // acrescenta mais uma semana ao prazo do empréstimo, e já soma o valor semanal do livro
  // (quando cadastrado) ao valor combinado — pode ser clicado toda semana, se precisar
  function renovarSemana(id) {
    setEmprestimos((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const livro = livroById(e.livroId);
        const baseParaSomar = e.prazo || todayISO();
        const novoPrazo = somarSemanas(baseParaSomar, 1);
        const acrescimo = livro ? livro.valorSemanaExtra || livro.valorSemanal || 0 : 0;
        return { ...e, prazo: novoPrazo, valorCombinado: (e.valorCombinado || 0) + acrescimo };
      })
    );
  }

  // anula (ou reativa) a multa por atraso de um empréstimo — útil quando o livro já foi
  // devolvido de verdade mas só esqueceram de marcar isso no sistema a tempo
  function alternarMultaAnulada(id) {
    setEmprestimos((prev) => prev.map((e) => (e.id === id ? { ...e, multaAnulada: !e.multaAnulada } : e)));
  }

  function addPagamento(id, valor) {
    const v = parseFloat(valor);
    if (!v || v <= 0) return;
    const emp = emprestimos.find((e) => e.id === id);
    setEmprestimos((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, pagamentos: [...(e.pagamentos || []), { id: uid(), valor: v, data: todayISO() }] }
          : e
      )
    );
    if (emp) {
      const pessoa = pessoaById(emp.pessoaId);
      auditar("Pagamento registrado", `${pessoa ? nomeCompleto(pessoa) : "pessoa removida"} · ${fmtMoney(v)}`);
    }
  }

  function removerPagamento(empId, pagamentoId) {
    setEmprestimos((prev) =>
      prev.map((e) =>
        e.id === empId ? { ...e, pagamentos: (e.pagamentos || []).filter((p) => p.id !== pagamentoId) } : e
      )
    );
  }

  function removeEmprestimo(id) {
    setEmprestimos((prev) => prev.filter((e) => e.id !== id));
  }

  // ---- Ações: Cobranças (fica registrado sempre que uma cobrança/lembrete é enviado) ----
  function registrarCobranca(emprestimoId, tipo, valor) {
    setCobrancas((prev) => [{ id: uid(), emprestimoId, tipo, valor: valor || 0, data: todayISO() }, ...prev]);
  }
  function removerCobranca(id) {
    setCobrancas((prev) => prev.filter((c) => c.id !== id));
  }

  // ---- Ações: Categorias e Tags ----
  function addCategoria(nome) {
    const n = nome.trim();
    if (!n || categorias.includes(n)) return;
    setCategorias((prev) => [...prev, n].sort());
  }
  function removerCategoria(nome) {
    setCategorias((prev) => prev.filter((c) => c !== nome));
    setLivros((prev) => prev.map((l) => (l.categoria === nome ? { ...l, categoria: "" } : l)));
  }
  function addTag(nome) {
    const n = nome.trim();
    if (!n || tags.includes(n)) return;
    setTags((prev) => [...prev, n].sort());
  }
  function removerTag(nome) {
    setTags((prev) => prev.filter((t) => t !== nome));
    setLivros((prev) => prev.map((l) => ({ ...l, tags: (l.tags || []).filter((t) => t !== nome) })));
  }

  if (!loaded) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLORS.cream,
          fontFamily: "'Source Serif 4', serif",
          color: COLORS.inkSoft,
        }}
      >
        Abrindo o catálogo…
      </div>
    );
  }

  if (!unlocked) {
    return (
      <TelaSenha
        temDadosSalvos={temDadosSalvos}
        onDesbloquear={desbloquear}
        onApagarTudo={apagarTudoEComecarDeNovo}
        onSemSenha={desativarSenha}
        cloudConfig={cloudConfig}
        cloudStatus={cloudStatus}
        onConfigurarNuvem={configurarNuvem}
        onDesligarNuvem={desligarNuvem}
        onEntrarAdmin={entrarAdmin}
        statusAdminAuth={statusAdminAuth}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.cream,
        fontFamily: "'Source Serif 4', serif",
        color: COLORS.ink,
        paddingBottom: 40,
      }}
    >
      <div style={{ background: COLORS.burgundyDark, padding: "28px 20px 22px", color: "#F5EFE0", position: "relative" }}>
        {!semSenha && (
          <button
            onClick={bloquear}
            title="Bloquear"
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              background: "transparent",
              border: `1px solid ${COLORS.gold}`,
              color: COLORS.gold,
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer",
            }}
          >
            🔒 bloquear
          </button>
        )}
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: 2,
            color: COLORS.gold,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Grupo Caseiro · Fichário
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="icon-192.png"
            alt=""
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${COLORS.gold}` }}
            onError={(e) => (e.target.style.display = "none")}
          />
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h1
              style={{
                fontFamily: "'Playfair Display', serif",
                fontStyle: "italic",
                fontSize: 32,
                margin: 0,
                fontWeight: 700,
              }}
            >
              {APP_NAME}
            </h1>
            <span style={{ fontSize: 18, color: COLORS.gold, opacity: 0.85 }}>ספרייה</span>
          </div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
          {saving ? "salvando…" : "biblioteca do grupo"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "0 16px",
          marginTop: 16,
          borderBottom: `2px solid ${COLORS.rule}`,
          overflowX: "auto",
        }}
      >
        {[
          { id: "emprestimos", label: "Empréstimos" },
          { id: "acervo", label: "Acervo" },
          { id: "categorias", label: "Categorias" },
          { id: "pessoas", label: "Pessoas" },
          { id: "fila", label: "Fila", badge: pedidosFila.length },
          { id: "financeiro", label: "Financeiro" },
          { id: "ajustes", label: "Ajustes" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: tab === t.id ? COLORS.burgundy : COLORS.inkSoft,
              borderBottom: tab === t.id ? `2px solid ${COLORS.burgundy}` : "2px solid transparent",
              marginBottom: -2,
              cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400,
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
            {!!t.badge && (
              <span
                style={{
                  marginLeft: 6,
                  background: COLORS.rust,
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 10.5,
                  padding: "1px 6px",
                  fontWeight: 700,
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
        {tab === "emprestimos" && (
          <EmprestimosTab
            livros={livros}
            emprestimos={emprestimos}
            pessoas={pessoas}
            pessoaById={pessoaById}
            statusOf={statusOf}
            totalPago={totalPago}
            livroById={livroById}
            config={config}
            filas={filas}
            onAdd={addEmprestimo}
            onDevolver={marcarDevolvido}
            onRenovarSemana={renovarSemana}
            onAlternarMultaAnulada={alternarMultaAnulada}
            onPagar={addPagamento}
            onRemoverPagamento={removerPagamento}
            onRemover={removeEmprestimo}
            onRegistrarCobranca={registrarCobranca}
            onMarcarPerdidoDanificado={marcarPerdidoDanificado}
          />
        )}
        {tab === "acervo" && (
          <AcervoTab
            livros={livros}
            emprestimos={emprestimos}
            categorias={categorias}
            tags={tags}
            pessoas={pessoas}
            pessoaById={pessoaById}
            filas={filas}
            onAdd={addLivro}
            onEdit={editarLivro}
            onRemove={removeLivro}
            onAdicionarFila={adicionarNaFila}
            onRemoverFila={removerDaFila}
            onMoverFila={moverNaFila}
          />
        )}
        {tab === "categorias" && (
          <CategoriasTab
            categorias={categorias}
            tags={tags}
            onAddCategoria={addCategoria}
            onRemoverCategoria={removerCategoria}
            onAddTag={addTag}
            onRemoverTag={removerTag}
          />
        )}
        {tab === "pessoas" && (
          <PessoasTab
            pessoas={pessoas}
            emprestimos={emprestimos}
            livroById={livroById}
            totalPago={totalPago}
            onUpsert={upsertPessoa}
            onRemove={removePessoa}
            onRegerarCodigo={regerarCodigoPessoa}
            preCadastros={preCadastros}
            onImportarPreCadastro={importarPreCadastro}
            onDescartarPreCadastro={descartarPreCadastro}
          />
        )}
        {tab === "fila" && (
          <FilaPedidosTab
            pedidosFila={pedidosFila}
            livroById={livroById}
            onAceitar={aceitarPedidoFila}
            onDescartar={descartarPedidoFila}
          />
        )}
        {tab === "financeiro" && (
          <FinanceiroTab
            emprestimos={emprestimos}
            cobrancas={cobrancas}
            pessoaById={pessoaById}
            livroById={livroById}
            totalPago={totalPago}
            onRemoverCobranca={removerCobranca}
            config={config}
          />
        )}
        {tab === "ajustes" && (
          <AjustesTab
            config={config}
            onChange={setConfig}
            cloudConfig={cloudConfig}
            cloudStatus={cloudStatus}
            onConfigurarNuvem={configurarNuvem}
            onDesligarNuvem={desligarNuvem}
            ultimoSalvamento={ultimoSalvamento}
            ultimoBackup={ultimoBackup}
            backups={backups}
            carregandoBackups={carregandoBackups}
            fazendoBackup={fazendoBackup}
            onFazerBackup={handleFazerBackupManual}
            onAtualizarBackups={atualizarListaBackups}
            onRestaurarBackup={restaurarBackup}
            onApagarBackup={apagarBackup}
            semSenha={semSenha}
            onTrocarSenha={trocarSenha}
            onDesativarSenha={desativarSenha}
            onAtivarSenha={ativarSenha}
            adminEmail={adminEmail}
            statusAdminAuth={statusAdminAuth}
            onEntrarAdmin={entrarAdmin}
            onSairAdmin={sairAdmin}
            notifPermitida={notifPermitida}
            onPedirPermissaoNotificacao={pedirPermissaoNotificacao}
            livros={livros}
            pessoas={pessoas}
            emprestimos={emprestimos}
            livroById={livroById}
            pessoaById={pessoaById}
            totalPago={totalPago}
            auditoria={auditoria}
            carregandoAuditoria={carregandoAuditoria}
            onCarregarAuditoria={carregarAuditoria}
          />
        )}
      </div>
    </div>
  );
}

