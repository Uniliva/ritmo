import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { readEpub } from "./epub";
import type { ParsedBook } from "./epub";

type Theme = "grafite" | "claro" | "preto";
type Settings = { speed: number; fontSize: number; textWidth: number; theme: Theme };
type SavedPosition = { chapterIndex: number; scrollTop: number };

const initialSettings: Settings = {
  speed: 32,
  fontSize: 34,
  textWidth: 740,
  theme: "grafite",
};

function readSettings(): Settings {
  try {
    const saved = localStorage.getItem("ritmo-settings");
    if (!saved) return initialSettings;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return initialSettings;
    const values = parsed as Record<string, unknown>;
    const theme = values.theme;
    return {
      speed: typeof values.speed === "number" && Number.isFinite(values.speed)
        ? Math.min(120, Math.max(8, values.speed))
        : initialSettings.speed,
      fontSize: typeof values.fontSize === "number" && Number.isFinite(values.fontSize)
        ? Math.min(56, Math.max(22, values.fontSize))
        : initialSettings.fontSize,
      textWidth: typeof values.textWidth === "number" && Number.isFinite(values.textWidth)
        ? Math.min(1100, Math.max(520, values.textWidth))
        : initialSettings.textWidth,
      theme: theme === "claro" || theme === "preto" || theme === "grafite"
        ? theme
        : initialSettings.theme,
    };
  } catch {
    return { ...initialSettings };
  }
}

function Icon({
  name,
  size = 18,
}: {
  name: "book" | "upload" | "play" | "pause" | "chevron" | "expand" | "panel" | "width" | "check" | "close";
  size?: number;
}) {
  const paths = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h8" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v5h14v-5" /></>,
    play: <path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5h3v14H8zM15 5h3v14h-3z" fill="currentColor" stroke="none" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    width: <><path d="M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function progressKey(file: File) {
  return `ritmo-progress:${file.name}:${file.size}`;
}

function getSavedPosition(key: string): SavedPosition | null {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) as SavedPosition : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [settings, setSettings] = useState(readSettings);
  const [book, setBook] = useState<ParsedBook | null>(null);
  const [bookKey, setBookKey] = useState("");
  const [activeChapter, setActiveChapter] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const chapter = book?.chapters[activeChapter];
  const chapterCount = book?.chapters.length ?? 0;
  const progress = chapterCount ? ((activeChapter + 1) / chapterCount) * 100 : 0;

  useEffect(() => {
    localStorage.setItem("ritmo-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !playing) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousFrameRef.current = null;
      return;
    }

    const step = (time: number) => {
      if (previousFrameRef.current !== null) {
        const elapsed = Math.min(time - previousFrameRef.current, 50);
        element.scrollTop += (settings.speed * elapsed) / 1000;
      }
      previousFrameRef.current = time;
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 2) {
        setPlaying(false);
        return;
      }
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousFrameRef.current = null;
    };
  }, [playing, settings.speed, activeChapter]);

  useEffect(() => {
    if (!bookKey) return;
    const saved = getSavedPosition(bookKey);
    setActiveChapter(Math.min(saved?.chapterIndex ?? 0, (book?.chapters.length ?? 1) - 1));
    setPlaying(false);
  }, [bookKey, book?.chapters.length]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !bookKey) return;
    const saved = getSavedPosition(bookKey);
    element.scrollTop = activeChapter === (saved?.chapterIndex ?? 0) ? (saved?.scrollTop ?? 0) : 0;
  }, [activeChapter, bookKey, chapter]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (book) setPlaying((current) => !current);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSettings((current) => ({ ...current, speed: Math.min(120, current.speed + 2) }));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSettings((current) => ({ ...current, speed: Math.max(8, current.speed - 2) }));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [book]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  const openFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".epub")) {
      setError("Escolha um arquivo com extensão .epub.");
      return;
    }

    setLoading(true);
    setError("");
    setPlaying(false);
    try {
      const parsed = await readEpub(file);
      setBook(parsed);
      setBookKey(progressKey(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir este EPUB.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void openFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void openFile(event.dataTransfer.files[0]);
  };

  const onScroll = () => {
    if (!bookKey || !scrollRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(
        bookKey,
        JSON.stringify({ chapterIndex: activeChapter, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
      );
    }, 250);
  };

  const chooseChapter = (index: number) => {
    if (index < 0 || index >= chapterCount) return;
    setPlaying(false);
    setActiveChapter(index);
    localStorage.setItem(bookKey, JSON.stringify({ chapterIndex: index, scrollTop: 0 }));
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setError("Não foi possível ativar a tela cheia neste navegador.");
    }
  };

  const themes = useMemo(
    () => [
      { id: "grafite" as const, label: "Grafite", background: "#17191c", text: "#eee9df" },
      { id: "claro" as const, label: "Papel", background: "#f4f0e7", text: "#2c2a26" },
      { id: "preto" as const, label: "Preto", background: "#050505", text: "#f1f1f1" },
    ],
    [],
  );

  const handleReaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "PageDown" && activeChapter < chapterCount - 1) chooseChapter(activeChapter + 1);
    if (event.key === "PageUp" && activeChapter > 0) chooseChapter(activeChapter - 1);
  };

  return (
    <main
      className={`app theme-${settings.theme} ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".epub,application/epub+zip"
        onChange={onFileChange}
      />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ritmo, início">
          <span className="brand-mark"><span /></span>
          <span>ritmo<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          {book && <span className="current-book"><Icon name="book" size={15} />{book.title}</span>}
          <button
            className="icon-button sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Recolher painel lateral" : "Expandir painel lateral"}
            aria-expanded={sidebarOpen}
            aria-controls="reading-sidebar"
            title={sidebarOpen ? "Recolher painel lateral" : "Expandir painel lateral"}
          >
            <Icon name="panel" size={17} />
          </button>
          <button className="button button-outline" onClick={() => fileInputRef.current?.click()}>
            <Icon name="upload" size={16} />
            <span>Abrir EPUB</span>
          </button>
        </div>
      </header>

      <section className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <aside className="sidebar" id="reading-sidebar" aria-hidden={!sidebarOpen}>
          <div className="sidebar-heading">
            <div>
              <p className="eyebrow">ESPAÇO DE LEITURA</p>
              <h1>Seu ritmo,<br />sua leitura.</h1>
            </div>
            <div className="live-indicator" title="Seus livros ficam no dispositivo"><span /></div>
          </div>

          {book ? (
            <div className="book-card">
              <div className="book-cover"><Icon name="book" size={23} /></div>
              <div className="book-info">
                <strong>{book.title}</strong>
                <span>{chapterCount} {chapterCount === 1 ? "capítulo" : "capítulos"}</span>
              </div>
              <div className="book-progress" aria-label={`${Math.round(progress)}% dos capítulos`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <button className="empty-book" onClick={() => fileInputRef.current?.click()}>
              <span className="empty-book-icon"><Icon name="upload" size={18} /></span>
              <span><strong>Nenhum livro aberto</strong><small>Escolha um EPUB para começar</small></span>
              <Icon name="chevron" size={17} />
            </button>
          )}

          <div className="section-title">
            <span>CAPÍTULOS</span>
            {book && <span className="chapter-count">{String(activeChapter + 1).padStart(2, "0")} / {String(chapterCount).padStart(2, "0")}</span>}
          </div>
          {book ? (
            <nav className="chapter-list" aria-label="Capítulos">
              {book.chapters.map((item, index) => (
                <button
                  key={item.id}
                  className={`chapter-item ${index === activeChapter ? "active" : ""}`}
                  onClick={() => chooseChapter(index)}
                  title={item.title}
                >
                  <span className="chapter-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="chapter-name">{item.title}</span>
                  {index === activeChapter && <span className="chapter-active-dot" />}
                </button>
              ))}
            </nav>
          ) : (
            <p className="empty-chapters">Os capítulos do livro aparecem aqui.</p>
          )}

          <div className="sidebar-footer">
            <span className="privacy-dot" />
            <span>Seus arquivos ficam só neste dispositivo</span>
          </div>
        </aside>

        <section className={`reader-panel theme-${settings.theme}`}>
          <div className="reader-toolbar">
            <div className="reading-location">
              <span className="location-label">LENDO AGORA</span>
              <strong>{chapter?.title ?? "Sua próxima leitura"}</strong>
            </div>
            <div className="toolbar-actions">
              {book && (
                <span className="chapter-progress">{String(activeChapter + 1).padStart(2, "0")} <i>/</i> {String(chapterCount).padStart(2, "0")}</span>
              )}
              <details className="width-settings">
                <summary className="icon-button" aria-label="Ajustar largura do texto" title="Ajustar largura do texto">
                  <Icon name="width" size={17} />
                </summary>
                <div className="width-popover">
                  <label className="range-control width-control">
                    <span className="range-heading"><span>Largura do texto</span><strong>{settings.textWidth}<small> px</small></strong></span>
                    <input
                      type="range"
                      min="520"
                      max="1100"
                      step="20"
                      value={settings.textWidth}
                      onChange={(event) => setSettings((current) => ({ ...current, textWidth: Number(event.target.value) }))}
                      aria-label="Largura do texto"
                      style={{ "--range-progress": `${((settings.textWidth - 520) / 580) * 100}%` } as React.CSSProperties}
                    />
                    <span className="range-ends"><span>Compacta</span><span>Ampla</span></span>
                  </label>
                </div>
              </details>
              <button className="icon-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} title="Tela cheia">
                <Icon name="expand" size={17} />
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button aria-label="Fechar mensagem" onClick={() => setError("")}><Icon name="close" size={16} /></button>
            </div>
          )}

          <div
            ref={scrollRef}
            className="reading-viewport"
            onScroll={onScroll}
            onKeyDown={handleReaderKeyDown}
            tabIndex={0}
            aria-label="Texto do livro"
          >
            {chapter ? (
              <article className="reading-content" style={{ fontSize: `${settings.fontSize}px`, maxWidth: `${settings.textWidth}px` }}>
                <div className="chapter-kicker">CAPÍTULO {String(activeChapter + 1).padStart(2, "0")}</div>
                <h2>{chapter.title}</h2>
                <div className="chapter-rule"><span /></div>
                {chapter.paragraphs.map((paragraph, index) => {
                  if (paragraph.kind === "heading") {
                    if (index === 0 && paragraph.text === chapter.title) return null;
                    return <h3 key={index}>{paragraph.text}</h3>;
                  }
                  if (paragraph.kind === "quote") return <blockquote key={index}>{paragraph.text}</blockquote>;
                  if (paragraph.kind === "list") return <p className="list-paragraph" key={index}><span>·</span>{paragraph.text}</p>;
                  return <p key={index}>{paragraph.text}</p>;
                })}
                <div className="chapter-end">
                  <span />
                  <p>Fim do capítulo</p>
                  {activeChapter < chapterCount - 1 && (
                    <button onClick={() => chooseChapter(activeChapter + 1)}>
                      Próximo capítulo <Icon name="chevron" size={15} />
                    </button>
                  )}
                </div>
              </article>
            ) : (
              <div className="welcome">
                <div className="welcome-orbit orbit-one" />
                <div className="welcome-orbit orbit-two" />
                <div className="welcome-icon"><Icon name="book" size={29} /></div>
                <p className="eyebrow">UM ESPAÇO FEITO PARA VOCÊ</p>
                <h2>Encontre o seu<br /><em>ritmo de leitura.</em></h2>
                <p className="welcome-copy">Abra um livro EPUB e transforme a leitura em uma experiência mais fluida, confortável e no seu tempo.</p>
                <button className="button button-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  <Icon name="upload" size={17} />
                  {loading ? "Abrindo seu livro..." : "Escolher um EPUB"}
                </button>
                <span className="supported-format">Compatível com arquivos .EPUB</span>
              </div>
            )}
          </div>

          <div className="control-dock">
            <div className="playback-control">
              <button
                className={`play-button ${playing ? "is-playing" : ""}`}
                onClick={() => setPlaying((current) => !current)}
                disabled={!book}
                aria-label={playing ? "Pausar rolagem" : "Iniciar rolagem"}
                title="Espaço para iniciar ou pausar"
              >
                <Icon name={playing ? "pause" : "play"} size={17} />
              </button>
              <div className="playback-label">
                <strong>{playing ? "Rolagem ativa" : "Iniciar leitura"}</strong>
                <span>Espaço para {playing ? "pausar" : "começar"}</span>
              </div>
              <div className="dock-divider" />
              <label className="range-control speed-control">
                <span className="range-heading"><span>Velocidade</span><strong>{settings.speed}<small> px/s</small></strong></span>
                <input
                  type="range"
                  min="8"
                  max="120"
                  step="1"
                  value={settings.speed}
                  onChange={(event) => setSettings((current) => ({ ...current, speed: Number(event.target.value) }))}
                  aria-label="Velocidade da rolagem"
                  style={{ "--range-progress": `${((settings.speed - 8) / 112) * 100}%` } as React.CSSProperties}
                />
                <span className="range-ends"><span>Lento</span><span>Rápido</span></span>
              </label>
              <div className="dock-divider" />
              <label className="range-control font-control">
                <span className="range-heading"><span>Tamanho da letra</span><strong>{settings.fontSize}<small> px</small></strong></span>
                <input
                  type="range"
                  min="22"
                  max="56"
                  step="1"
                  value={settings.fontSize}
                  onChange={(event) => setSettings((current) => ({ ...current, fontSize: Number(event.target.value) }))}
                  aria-label="Tamanho da letra"
                  style={{ "--range-progress": `${((settings.fontSize - 22) / 34) * 100}%` } as React.CSSProperties}
                />
                <span className="range-ends"><span>A</span><span className="large-a">A</span></span>
              </label>
            </div>
            <div className="theme-control">
              <span>TEMA</span>
              <div className="theme-options">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    className={`theme-option ${settings.theme === theme.id ? "selected" : ""}`}
                    onClick={() => setSettings((current) => ({ ...current, theme: theme.id }))}
                    aria-label={`Tema ${theme.label}`}
                    aria-pressed={settings.theme === theme.id}
                    title={theme.label}
                  >
                    <span style={{ backgroundColor: theme.background, color: theme.text }}>Aa</span>
                    {settings.theme === theme.id && <i><Icon name="check" size={10} /></i>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>

      {dragging && <div className="drop-overlay"><div><Icon name="upload" size={28} /><strong>Solte seu EPUB aqui</strong><span>Seu livro será aberto neste dispositivo</span></div></div>}
    </main>
  );
}
