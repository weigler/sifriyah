// ---------------- Acervo ----------------
async function buscarCapaGoogleBooks(titulo, q_autor) {
  async function tentar(q) {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`);
    if (!res.ok) throw new Error("google-books-http-" + res.status);
    const data = await res.json();
    const itens = data?.items || [];
    for (const item of itens) {
      const links = item?.volumeInfo?.imageLinks;
      const link = links?.thumbnail || links?.smallThumbnail;
      if (link) return link.replace("http://", "https://");
    }
    return null;
  }
  // 1ª tentativa: título + autor juntos (busca livre, sem operadores rígidos)
  if (q_autor) {
    const achou = await tentar(`${titulo} ${q_autor}`);
    if (achou) return achou;
  }
  // 2ª tentativa: só o título
  return await tentar(titulo);
}

async function buscarCapaOpenLibrary(titulo, autor) {
  const q = autor ? `${titulo} ${autor}` : titulo;
  const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=cover_i`);
  if (!res.ok) throw new Error("open-library-http-" + res.status);
  const data = await res.json();
  const itens = data?.docs || [];
  for (const item of itens) {
    if (item.cover_i) return `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`;
  }
  return null;
}

// tenta o Google Books primeiro e, se não achar nada (ou der erro — rede, CORS, etc.),
// tenta o Open Library como segunda fonte. Retorna { link, motivo } — motivo explica
// o que aconteceu quando link vem nulo, pra não ficar um botão que "não faz nada".
async function buscarCapaLivro(titulo, autor) {
  let erroGoogle = null;
  try {
    const link = await buscarCapaGoogleBooks(titulo, autor);
    if (link) return { link, motivo: null };
  } catch (e) {
    erroGoogle = e.message;
  }
  try {
    const link = await buscarCapaOpenLibrary(titulo, autor);
    if (link) return { link, motivo: null };
  } catch (e) {
    return {
      link: null,
      motivo: erroGoogle
        ? "Não consegui acessar os buscadores de capa agora (sem internet ou bloqueado pelo navegador)."
        : "Nenhuma capa encontrada pra esse título nos buscadores.",
    };
  }
  return { link: null, motivo: "Nenhuma capa encontrada pra esse título nos buscadores." };
}

function AcervoTab({
  livros,
  emprestimos,
  categorias,
  tags,
  pessoas,
  pessoaById,
  filas,
  onAdd,
  onEdit,
  onRemove,
  onAdicionarFila,
  onRemoverFila,
  onMoverFila,
}) {
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [paginas, setPaginas] = useState("");
  const [dataAquisicao, setDataAquisicao] = useState("");
  const [capaUrl, setCapaUrl] = useState("");
  const [valorSemanal, setValorSemanal] = useState("");
  const [valorSemanaExtra, setValorSemanaExtra] = useState("");
  const [limiteSemanas, setLimiteSemanas] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [categoria, setCategoria] = useState("");
  const [nivel, setNivel] = useState("");
  const [sinopse, setSinopse] = useState("");
  const [linkExterno, setLinkExterno] = useState("");
  const [tagsSelecionadas, setTagsSelecionadas] = useState([]);
  const [buscandoCapa, setBuscandoCapa] = useState(false);
  const [avisoCapa, setAvisoCapa] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editAutor, setEditAutor] = useState("");
  const [editPaginas, setEditPaginas] = useState("");
  const [editData, setEditData] = useState("");
  const [editCapaUrl, setEditCapaUrl] = useState("");
  const [editValorSemanal, setEditValorSemanal] = useState("");
  const [editValorSemanaExtra, setEditValorSemanaExtra] = useState("");
  const [editLimiteSemanas, setEditLimiteSemanas] = useState("");
  const [editQuantidade, setEditQuantidade] = useState("1");
  const [editCategoria, setEditCategoria] = useState("");
  const [editNivel, setEditNivel] = useState("");
  const [editSinopse, setEditSinopse] = useState("");
  const [editLinkExterno, setEditLinkExterno] = useState("");
  const [editTagsSelecionadas, setEditTagsSelecionadas] = useState([]);
  const [buscandoCapaEdit, setBuscandoCapaEdit] = useState(false);
  const [avisoCapaEdit, setAvisoCapaEdit] = useState("");
  const [filaSelecionado, setFilaSelecionado] = useState({}); // { [livroId]: pessoaId }
  const [filaNomeNovo, setFilaNomeNovo] = useState({}); // { [livroId]: "nome pra cadastrar na hora" }

  function filaDoLivro(livroId) {
    return filas.filter((f) => f.livroId === livroId).sort((a, b) => (a.ordem ?? a.criadoEm) - (b.ordem ?? b.criadoEm));
  }

  function alternarTag(lista, setLista, tag) {
    setLista(lista.includes(tag) ? lista.filter((t) => t !== tag) : [...lista, tag]);
  }

  async function buscarCapaNovo() {
    if (!titulo.trim()) return;
    setBuscandoCapa(true);
    setAvisoCapa("");
    const { link, motivo } = await buscarCapaLivro(titulo, autor);
    if (link) setCapaUrl(link);
    else setAvisoCapa(motivo || "Nenhuma capa encontrada.");
    setBuscandoCapa(false);
  }
  async function buscarCapaEditar() {
    if (!editTitulo.trim()) return;
    setBuscandoCapaEdit(true);
    setAvisoCapaEdit("");
    const { link, motivo } = await buscarCapaLivro(editTitulo, editAutor);
    if (link) setEditCapaUrl(link);
    else setAvisoCapaEdit(motivo || "Nenhuma capa encontrada.");
    setBuscandoCapaEdit(false);
  }

  function abrirEdicao(l) {
    setEditandoId(l.id);
    setEditTitulo(l.titulo);
    setEditAutor(l.autor || "");
    setEditPaginas(l.paginas || "");
    setEditData(l.dataAquisicao || "");
    setEditCapaUrl(l.capaUrl || "");
    setEditValorSemanal(l.valorSemanal || "");
    setEditValorSemanaExtra(l.valorSemanaExtra || "");
    setEditLimiteSemanas(l.limiteSemanas || "");
    setEditQuantidade(String(l.quantidade || 1));
    setEditCategoria(l.categoria || "");
    setEditNivel(l.nivel || "");
    setEditSinopse(l.sinopse || "");
    setEditLinkExterno(l.linkExterno || "");
    setEditTagsSelecionadas(l.tags || []);
  }
  function salvarEdicao() {
    onEdit(editandoId, {
      titulo: editTitulo,
      autor: editAutor,
      paginas: editPaginas,
      dataAquisicao: editData,
      capaUrl: editCapaUrl,
      valorSemanal: editValorSemanal,
      valorSemanaExtra: editValorSemanaExtra,
      limiteSemanas: editLimiteSemanas,
      quantidade: editQuantidade,
      categoria: editCategoria,
      nivel: editNivel,
      sinopse: editSinopse,
      linkExterno: editLinkExterno,
      tags: editTagsSelecionadas,
    });
    setEditandoId(null);
  }

  return (
    <Section eyebrow="Catálogo" title="Acervo">
      <div
        style={{
          background: COLORS.card,
          border: `1.5px solid ${COLORS.rule}`,
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <label style={labelStyle}>Cadastrar livro</label>

        {/* 1 — Título */}
        <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

        {/* 2 — Autor (obrigatório) */}
        <Input placeholder="Autor" value={autor} onChange={(e) => setAutor(e.target.value)} />

        {/* 3 — Dia de aquisição / Páginas / Unidades */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CampoCol label="Dia de aquisição">
            <Input type="date" value={dataAquisicao} onChange={(e) => setDataAquisicao(e.target.value)} />
          </CampoCol>
          <CampoCol label="Páginas">
            <Input type="number" placeholder="Páginas" value={paginas} onChange={(e) => setPaginas(e.target.value)} />
          </CampoCol>
          <CampoCol label="Unidades">
            <Input type="number" min="1" placeholder="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </CampoCol>
        </div>

        {/* 4 — Categoria / Nível de leitura */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ ...inputBase, flex: "1 1 140px" }}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={{ ...inputBase, flex: "1 1 140px" }}>
            <option value="">Nível de leitura</option>
            {NIVEIS_LEITURA.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* 5 — Valor semanal / Valor extra / Semanas iniciais */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CampoCol label="Valor semanal">
            <Input
              type="number"
              step="0.01"
              placeholder="R$"
              value={valorSemanal}
              onChange={(e) => setValorSemanal(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13 }}
            />
          </CampoCol>
          <CampoCol label="Valor semana extra">
            <Input
              type="number"
              step="0.01"
              placeholder="R$"
              value={valorSemanaExtra}
              onChange={(e) => setValorSemanaExtra(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13 }}
            />
          </CampoCol>
          <CampoCol label="Semanas iniciais">
            <Input
              type="number"
              placeholder="semanas"
              value={limiteSemanas}
              onChange={(e) => setLimiteSemanas(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13 }}
            />
          </CampoCol>
        </div>

        {/* 6 — Sinopse */}
        <label style={{ ...labelStyle, marginBottom: 2 }}>Sinopse (opcional)</label>
        <textarea
          value={sinopse}
          onChange={(e) => setSinopse(e.target.value)}
          rows={3}
          placeholder="Do que o livro trata…"
          style={{ ...inputBase, fontFamily: "'Source Serif 4', serif" }}
        />

        {/* 7 — Tags */}
        {tags.length > 0 && (
          <details>
            <summary style={{ fontSize: 12.5, color: COLORS.burgundy, cursor: "pointer" }}>marcar tags</summary>
            <div style={{ marginTop: 8 }}>
              <SeletorTags
                todasTags={tags}
                selecionadas={tagsSelecionadas}
                onToggle={(t) => alternarTag(tagsSelecionadas, setTagsSelecionadas, t)}
              />
            </div>
          </details>
        )}

        {/* 8 — Link Amazon */}
        <Input
          placeholder="Link (Amazon, editora, etc. — opcional)"
          value={linkExterno}
          onChange={(e) => setLinkExterno(e.target.value)}
        />

        {/* 9 — Capa */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input
            placeholder="Link da capa (opcional)"
            value={capaUrl}
            onChange={(e) => setCapaUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          {capaUrl && (
            <img src={capaUrl} alt="" style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 3, border: `1px solid ${COLORS.rule}` }} />
          )}
          <Button variant="subtle" style={{ padding: "9px 12px", fontSize: 13, whiteSpace: "nowrap" }} onClick={buscarCapaNovo} disabled={buscandoCapa}>
            {buscandoCapa ? "buscando…" : "🔍 buscar capa"}
          </Button>
        </div>
        {avisoCapa && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{avisoCapa}</div>}
        <Button
          style={{ alignSelf: "flex-start" }}
          disabled={!titulo.trim() || !autor.trim()}
          onClick={() => {
            if (!titulo.trim() || !autor.trim()) return;
            onAdd({
              titulo,
              autor,
              paginas,
              dataAquisicao,
              capaUrl,
              valorSemanal,
              valorSemanaExtra,
              limiteSemanas,
              quantidade,
              categoria,
              nivel,
              sinopse,
              linkExterno,
              tags: tagsSelecionadas,
            });
            setTitulo("");
            setAutor("");
            setPaginas("");
            setDataAquisicao("");
            setCapaUrl("");
            setValorSemanal("");
            setValorSemanaExtra("");
            setLimiteSemanas("");
            setQuantidade("1");
            setCategoria("");
            setNivel("");
            setSinopse("");
            setLinkExterno("");
            setTagsSelecionadas([]);
          }}
        >
          Adicionar ao acervo
        </Button>
      </div>

      {livros.length === 0 && <EmptyState text="Nenhum livro cadastrado ainda." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {livros.map((l) => {
          const quantidade = l.quantidade || 1;
          const unidadesFora = emprestimos.filter((e) => e.livroId === l.id && !e.devolvido).length;
          const emprestado = unidadesFora >= quantidade;
          const editando = editandoId === l.id;
          return (
            <div
              key={l.id}
              style={{
                background: COLORS.card,
                border: `1.5px solid ${COLORS.rule}`,
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              {editando ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} placeholder="Título" />
                  <Input value={editAutor} onChange={(e) => setEditAutor(e.target.value)} placeholder="Autor" />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <CampoCol label="Dia de aquisição">
                      <Input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
                    </CampoCol>
                    <CampoCol label="Páginas">
                      <Input type="number" value={editPaginas} onChange={(e) => setEditPaginas(e.target.value)} placeholder="Páginas" />
                    </CampoCol>
                    <CampoCol label="Unidades">
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={editQuantidade}
                        onChange={(e) => setEditQuantidade(e.target.value)}
                      />
                    </CampoCol>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} style={{ ...inputBase, flex: "1 1 130px" }}>
                      <option value="">Sem categoria</option>
                      {categorias.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select value={editNivel} onChange={(e) => setEditNivel(e.target.value)} style={{ ...inputBase, flex: "1 1 130px" }}>
                      <option value="">Nível de leitura</option>
                      {NIVEIS_LEITURA.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <CampoCol label="Valor semanal">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="R$"
                        value={editValorSemanal}
                        onChange={(e) => setEditValorSemanal(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13 }}
                      />
                    </CampoCol>
                    <CampoCol label="Valor semana extra">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="R$"
                        value={editValorSemanaExtra}
                        onChange={(e) => setEditValorSemanaExtra(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13 }}
                      />
                    </CampoCol>
                    <CampoCol label="Semanas iniciais">
                      <Input
                        type="number"
                        placeholder="semanas"
                        value={editLimiteSemanas}
                        onChange={(e) => setEditLimiteSemanas(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13 }}
                      />
                    </CampoCol>
                  </div>
                  <label style={{ ...labelStyle, marginBottom: 2 }}>Sinopse (opcional)</label>
                  <textarea
                    value={editSinopse}
                    onChange={(e) => setEditSinopse(e.target.value)}
                    rows={3}
                    style={{ ...inputBase, fontFamily: "'Source Serif 4', serif" }}
                  />
                  {tags.length > 0 && (
                    <details>
                      <summary style={{ fontSize: 12.5, color: COLORS.burgundy, cursor: "pointer" }}>marcar tags</summary>
                      <div style={{ marginTop: 8 }}>
                        <SeletorTags
                          todasTags={tags}
                          selecionadas={editTagsSelecionadas}
                          onToggle={(t) => alternarTag(editTagsSelecionadas, setEditTagsSelecionadas, t)}
                        />
                      </div>
                    </details>
                  )}
                  <Input
                    placeholder="Link (Amazon, editora, etc.)"
                    value={editLinkExterno}
                    onChange={(e) => setEditLinkExterno(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input placeholder="Link da capa" value={editCapaUrl} onChange={(e) => setEditCapaUrl(e.target.value)} style={{ flex: 1 }} />
                    {editCapaUrl && (
                      <img src={editCapaUrl} alt="" style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 3, border: `1px solid ${COLORS.rule}` }} />
                    )}
                    <Button variant="subtle" style={{ padding: "7px 10px", fontSize: 12.5, whiteSpace: "nowrap" }} onClick={buscarCapaEditar} disabled={buscandoCapaEdit}>
                      {buscandoCapaEdit ? "buscando…" : "🔍 buscar"}
                    </Button>
                  </div>
                  {avisoCapaEdit && <div style={{ fontSize: 12, color: COLORS.inkSoft }}>{avisoCapaEdit}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button style={{ padding: "7px 12px", fontSize: 13 }} disabled={!editTitulo.trim() || !editAutor.trim()} onClick={salvarEdicao}>
                      Salvar
                    </Button>
                    <Button variant="ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setEditandoId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {l.capaUrl ? (
                    <img
                      src={l.capaUrl}
                      alt=""
                      style={{ width: 40, height: 56, objectFit: "cover", borderRadius: 4, border: `1px solid ${COLORS.rule}`, flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 40,
                        height: 56,
                        borderRadius: 4,
                        border: `1px solid ${COLORS.rule}`,
                        background: COLORS.cream,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        opacity: 0.4,
                      }}
                    >
                      📕
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: 16 }}>{l.titulo}</div>
                    {l.autor && <div style={{ fontSize: 13, color: COLORS.inkSoft }}>{l.autor}</div>}
                    <div style={{ fontSize: 11.5, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                      {l.paginas ? `${l.paginas} páginas` : ""}
                      {l.paginas && l.dataAquisicao ? " · " : ""}
                      {l.dataAquisicao ? `adquirido em ${fmtDate(l.dataAquisicao)}` : ""}
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                      {l.categoria ? `${l.categoria}` : ""}
                      {l.categoria && l.valorSemanal ? " · " : ""}
                      {l.valorSemanal ? `${fmtMoney(l.valorSemanal)}/semana` : ""}
                      {l.limiteSemanas ? ` · limite ${l.limiteSemanas} sem.` : ""}
                      {l.valorSemanaExtra ? ` · ${fmtMoney(l.valorSemanaExtra)}/sem. extra` : ""}
                      {quantidade > 1 ? ` · ${quantidade} unidades` : ""}
                    </div>
                    {l.nivel && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 10.5,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: COLORS.sage,
                          border: `1px solid ${COLORS.sage}`,
                          borderRadius: 10,
                          padding: "1px 7px",
                          marginTop: 4,
                        }}
                      >
                        {l.nivel}
                      </span>
                    )}
                    {l.tags && l.tags.length > 0 && (
                      <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 4 }}>
                        {l.tags.map((t) => `#${t}`).join(" ")}
                      </div>
                    )}
                    {l.sinopse && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: 11.5, color: COLORS.burgundy, cursor: "pointer" }}>sinopse</summary>
                        <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 4, lineHeight: 1.5 }}>{l.sinopse}</div>
                      </details>
                    )}
                    {l.linkExterno && (
                      <div style={{ marginTop: 4 }}>
                        <a
                          href={l.linkExterno}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11.5, color: COLORS.burgundy }}
                        >
                          🔗 ver mais / comprar
                        </a>
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10.5,
                      letterSpacing: 0.5,
                      padding: "4px 8px",
                      borderRadius: 12,
                      color: emprestado ? COLORS.burgundy : COLORS.sage,
                      border: `1px solid ${emprestado ? COLORS.burgundy : COLORS.sage}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {emprestado
                      ? "FORA"
                      : quantidade > 1
                      ? `${quantidade - unidadesFora} DE ${quantidade} NA PRATELEIRA`
                      : "NA PRATELEIRA"}
                  </span>
                  <button
                    onClick={() => abrirEdicao(l)}
                    style={{ background: "none", border: "none", color: COLORS.burgundy, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
                  >
                    editar
                  </button>
                  <BotaoExcluir label="excluir" onConfirm={() => onRemove(l.id)} />
                </div>
              )}
              {!editando && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, color: COLORS.burgundy, cursor: "pointer" }}>
                    fila de espera{filaDoLivro(l.id).length > 0 ? ` (${filaDoLivro(l.id).length})` : ""}
                  </summary>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {filaDoLivro(l.id).map((f, i) => {
                      const p = pessoaById(f.pessoaId);
                      return (
                        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.inkSoft, width: 20 }}>
                            {i + 1}º
                          </span>
                          <span style={{ flex: 1 }}>{p ? nomeCompleto(p) : "(pessoa removida)"}</span>
                          <button
                            onClick={() => onMoverFila(f.id, -1)}
                            disabled={i === 0}
                            style={{ background: "none", border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: "2px 6px", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.35 : 1 }}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => onMoverFila(f.id, 1)}
                            disabled={i === filaDoLivro(l.id).length - 1}
                            style={{ background: "none", border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: "2px 6px", cursor: i === filaDoLivro(l.id).length - 1 ? "default" : "pointer", opacity: i === filaDoLivro(l.id).length - 1 ? 0.35 : 1 }}
                          >
                            ↓
                          </button>
                          <BotaoExcluir label="remover" small onConfirm={() => onRemoverFila(f.id)} />
                        </div>
                      );
                    })}
                    {filaDoLivro(l.id).length === 0 && (
                      <div style={{ fontSize: 12, color: COLORS.inkSoft }}>Ninguém esperando esse livro ainda.</div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      <select
                        value={filaSelecionado[l.id] || ""}
                        onChange={(e) => setFilaSelecionado((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        style={{ ...inputBase, flex: "1 1 160px", padding: "6px 8px", fontSize: 12.5 }}
                      >
                        <option value="">+ pessoa já cadastrada…</option>
                        {pessoas.map((p) => (
                          <option key={p.id} value={p.id}>{nomeCompleto(p)}</option>
                        ))}
                      </select>
                      <Button
                        variant="subtle"
                        style={{ padding: "6px 10px", fontSize: 12.5 }}
                        onClick={() => {
                          if (!filaSelecionado[l.id]) return;
                          onAdicionarFila(l.id, filaSelecionado[l.id]);
                          setFilaSelecionado((prev) => ({ ...prev, [l.id]: "" }));
                        }}
                      >
                        Adicionar
                      </Button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Input
                        placeholder="ou nome de alguém novo"
                        value={filaNomeNovo[l.id] || ""}
                        onChange={(e) => setFilaNomeNovo((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        style={{ flex: "1 1 160px", padding: "6px 8px", fontSize: 12.5 }}
                      />
                      <Button
                        variant="subtle"
                        style={{ padding: "6px 10px", fontSize: 12.5 }}
                        onClick={() => {
                          const nome = (filaNomeNovo[l.id] || "").trim();
                          if (!nome) return;
                          const { nome: primeiro, sobrenome } = separarNome(nome);
                          onAdicionarFila(l.id, null, { nome: primeiro, sobrenome });
                          setFilaNomeNovo((prev) => ({ ...prev, [l.id]: "" }));
                        }}
                      >
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

