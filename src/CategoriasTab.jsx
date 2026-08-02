// ---------------- Categorias e Tags ----------------
function CategoriasTab({ categorias, tags, onAddCategoria, onRemoverCategoria, onAddTag, onRemoverTag }) {
  const [novaCategoria, setNovaCategoria] = useState("");
  const [novaTag, setNovaTag] = useState("");

  return (
    <div>
      <Section eyebrow="Organização" title="Categorias">
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 12 }}>
          Cada livro tem <b>uma</b> categoria (ex: teologia, biografia, ficção). Cadastre aqui pra elas aparecerem
          como opções prontas no Acervo.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Input
            placeholder="Nova categoria"
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAddCategoria(novaCategoria);
                setNovaCategoria("");
              }
            }}
          />
          <Button
            onClick={() => {
              onAddCategoria(novaCategoria);
              setNovaCategoria("");
            }}
          >
            Adicionar
          </Button>
        </div>
        {categorias.length === 0 && <EmptyState text="Nenhuma categoria cadastrada ainda." />}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {categorias.map((c) => (
            <div
              key={c}
              style={{
                background: COLORS.card,
                border: `1.5px solid ${COLORS.rule}`,
                borderRadius: 20,
                padding: "6px 8px 6px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13.5,
              }}
            >
              {c}
              <BotaoExcluir small label="×" onConfirm={() => onRemoverCategoria(c)} />
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Organização" title="Tags">
        <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 12 }}>
          As tags funcionam como subcategorias — um livro pode ter <b>várias</b> ao mesmo tempo (ex: "reforma",
          "apologética", "leitura fácil").
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Input
            placeholder="Nova tag"
            value={novaTag}
            onChange={(e) => setNovaTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAddTag(novaTag);
                setNovaTag("");
              }
            }}
          />
          <Button
            onClick={() => {
              onAddTag(novaTag);
              setNovaTag("");
            }}
          >
            Adicionar
          </Button>
        </div>
        {tags.length === 0 && <EmptyState text="Nenhuma tag cadastrada ainda." />}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tags.map((t) => (
            <div
              key={t}
              style={{
                background: "#FBF3DC",
                border: `1.5px solid ${COLORS.gold}`,
                borderRadius: 20,
                padding: "6px 8px 6px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13.5,
              }}
            >
              #{t}
              <BotaoExcluir small label="×" onConfirm={() => onRemoverTag(t)} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

