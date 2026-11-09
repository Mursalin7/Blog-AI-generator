import Head from "next/head";
import Link from "next/link";
import {
  useCallback,
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "../lib/supabase";

const MAX_INPUT_LENGTH = 500;
const DAILY_GENERATION_LIMIT = 5;

const renderInlineMarkdown = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );

const renderArticle = (content: string): ReactNode[] => {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let numberedItems: string[] = [];

  const flushLists = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {bullets.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      bullets = [];
    }

    if (numberedItems.length) {
      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {numberedItems.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      numberedItems = [];
    }
  };

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushLists();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushLists();
      const headingText = renderInlineMarkdown(heading[2]);
      const key = `heading-${blocks.length}`;

      if (heading[1].length === 1) {
        blocks.push(
          <h2 key={key} className="article-title">
            {headingText}
          </h2>
        );
      } else if (heading[1].length === 2) {
        blocks.push(<h3 key={key}>{headingText}</h3>);
      } else {
        blocks.push(<h4 key={key}>{headingText}</h4>);
      }
      return;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (numberedItems.length) {
        flushLists();
      }
      bullets.push(bullet[1]);
      return;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      if (bullets.length) {
        flushLists();
      }
      numberedItems.push(numbered[1]);
      return;
    }

    flushLists();
    blocks.push(
      <p key={`paragraph-${blocks.length}`}>{renderInlineMarkdown(line)}</p>
    );
  });

  flushLists();
  return blocks;
};

const HomePage = () => {
  const [input, setInput] = useState("");
  const [apiResponse, setApiResponse] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const generationControllerRef = useRef<AbortController | null>(null);

  const clearDraft = useCallback(() => {
    generationControllerRef.current?.abort();
    generationControllerRef.current = null;
    setInput("");
    setApiResponse("");
    setErrorMessage("");
    setCopyStatus("");
    setIsLoading(false);
    setRemainingToday(null);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabasePublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      setAuthError(
        "Supabase is not configured. Add the project URL and publishable key to your environment."
      );
      setAuthReady(true);
      return;
    }

    try {
      const supabase = createSupabaseClient();
      supabaseRef.current = supabase;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        if (!nextSession) {
          clearDraft();
        }
      });

      void supabase.auth.getSession().then(({ data, error }) => {
        if (!isMounted) {
          return;
        }
        if (error) {
          setAuthError("Unable to restore your session. Please sign in again.");
        }
        setSession(data.session);
        setAuthReady(true);
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch {
      setAuthError("Unable to initialize Supabase. Check your environment settings.");
      setAuthReady(true);
    }
  }, [clearDraft]);

  useEffect(() => {
    if (!apiResponse || !articleRef.current) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    articleRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    articleRef.current.focus({ preventScroll: true });
  }, [apiResponse]);

  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    setErrorMessage("");
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = supabaseRef.current;

    if (!supabase) {
      setAuthError("Supabase is not configured. Check your environment settings.");
      return;
    }

    setIsAuthLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      if (authMode === "signUp") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) {
          throw error;
        }
        if (data.session) {
          clearDraft();
        }
        if (!data.session) {
          setAuthMessage("Check your email for a confirmation link, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          throw error;
        }
        clearDraft();
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed. Try again."
      );
    } finally {
      setIsAuthLoading(false);
    }
  };

  const signOut = async () => {
    const supabase = supabaseRef.current;
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorMessage("Unable to sign out. Please try again.");
      return;
    }
    clearDraft();
  };

  const generatePost = async () => {
    const topic = input.trim();

    if (topic.length < 3) {
      setErrorMessage("Please enter a topic with at least 3 characters.");
      return;
    }

    if (topic.length > MAX_INPUT_LENGTH) {
      setErrorMessage(`Keep your topic under ${MAX_INPUT_LENGTH} characters.`);
      return;
    }

    setIsLoading(true);
    setApiResponse("");
    setErrorMessage("");
    setCopyStatus("");

    try {
      if (!session) {
        throw new Error("Please sign in before generating an article.");
      }

      const controller = new AbortController();
      generationControllerRef.current = controller;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ input: topic }),
        signal: controller.signal,
      });

      const data: {
        output?: string;
        error?: string;
        remainingToday?: number;
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to generate your article.");
      }

      if (!data.output) {
        throw new Error("The generator returned an empty article. Please try again.");
      }

      setApiResponse(data.output);
      generationControllerRef.current = null;
      if (typeof data.remainingToday === "number") {
        setRemainingToday(data.remainingToday);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again later."
      );
    } finally {
      generationControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const copyArticle = async () => {
    try {
      await navigator.clipboard.writeText(apiResponse);
      setCopyStatus("Article copied to clipboard.");
    } catch {
      setCopyStatus("Could not copy the article. Please try again.");
    }
  };

  const wordCount = apiResponse.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="app-shell">
      <Head>
        <title>BlogWriter.ai — AI Blog Writer</title>
        <meta
          name="description"
          content="Turn a topic or rough notes into a concise, polished blog draft."
        />
      </Head>

      <header className="topbar">
        <Link className="brand" href="/" aria-label="BlogWriter.ai home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">
            BlogWriter<span>.ai</span>
          </span>
        </Link>
        <div className="engine-status">
          <span className="status-dot" />
          <span>GROQ CLOUD</span>
        </div>
        {session && (
          <div className="account-controls">
            <span className="account-email">{session.user.email}</span>
            <button className="sign-out-button" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="workspace">
        <div className="ambient-glow ambient-glow-violet" />
        <div className="ambient-glow ambient-glow-cyan" />

        {!authReady ? (
          <div className="loading-state" role="status">
            <span className="loading-spinner" />
            <span>Restoring your session...</span>
          </div>
        ) : !session ? (
          <section className="auth-panel" aria-labelledby="auth-title">
            <div className="eyebrow">
              <span className="sparkle" aria-hidden="true">✦</span>
              <span>Your writing workspace</span>
            </div>
            <h1 id="auth-title">
              {authMode === "signIn" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="auth-description">
              Sign in to create concise drafts and keep your daily usage tied to your account.
            </p>
            <form className="auth-form" onSubmit={(event) => void handleAuthSubmit(event)}>
              <label htmlFor="auth-email">Email</label>
              <input
                autoComplete="email"
                id="auth-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
              <label htmlFor="auth-password">Password</label>
              <input
                autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
                id="auth-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <p className="auth-hint">Use at least 8 characters for your password.</p>
              {authError && <p className="error-message" role="alert">{authError}</p>}
              {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
              <button className="generate-button auth-submit" disabled={isAuthLoading} type="submit">
                {isAuthLoading
                  ? "Please wait..."
                  : authMode === "signIn"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
            <button
              className="auth-mode-button"
              onClick={() => {
                setAuthMode(authMode === "signIn" ? "signUp" : "signIn");
                setAuthError("");
                setAuthMessage("");
              }}
              type="button"
            >
              {authMode === "signIn"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </section>
        ) : (
        <>
        <section className="hero" aria-labelledby="page-title">
          <div className="eyebrow">
            <span className="sparkle" aria-hidden="true">
              ✦
            </span>
            <span>Autonomous editorial intelligence</span>
          </div>
          <h1 id="page-title">
            Write, <span>rank-ready articles</span> in seconds, not days
          </h1>
          <p className="hero-description">
            Turn a topic, keyword, or a few rough notes into a concise,
            polished article that gets straight to the point.
          </p>

          <form
            className="prompt-card"
            onSubmit={(event) => {
              event.preventDefault();
              void generatePost();
            }}
          >
            <label className="visually-hidden" htmlFor="article-topic">
              Article topic or notes
            </label>
            <textarea
              id="article-topic"
              onChange={handleInput}
              value={input}
              maxLength={MAX_INPUT_LENGTH}
              placeholder="Enter a topic or a few notes (up to 500 characters)..."
              rows={3}
              aria-describedby={`input-count${errorMessage ? " generation-error" : ""}`}
            />
            <div className="input-footer">
              <span className="input-hint">Keep it focused for a concise result.</span>
              <span className="input-count" id="input-count">
                {input.length}/{MAX_INPUT_LENGTH}
              </span>
              {remainingToday !== null && (
                <span className="input-count">
                  {remainingToday}/{DAILY_GENERATION_LIMIT} left today
                </span>
              )}
            </div>
            <div className="prompt-toolbar">
              <div className="prompt-details" aria-label="Generation settings">
                <span className="detail-chip">
                  <span className="chip-icon" aria-hidden="true">
                    ◈
                  </span>
                  Clear, useful style
                </span>
                <span className="detail-chip">
                  <span className="chip-icon chip-icon-cyan" aria-hidden="true">
                    ◉
                  </span>
                  QWEN 3.6 27B
                </span>
                <span className="detail-chip">
                  <span className="chip-icon" aria-hidden="true">
                    ▤
                  </span>
                  Brief draft
                </span>
              </div>
              <button
                className="generate-button"
                type="submit"
                disabled={isLoading || !input.trim()}
              >
                <span>{isLoading ? "Writing your draft..." : "Generate brief"}</span>
                <span className="button-bolt" aria-hidden="true">
                  ↗
                </span>
              </button>
            </div>
          </form>

          {errorMessage && (
            <p className="error-message" id="generation-error" role="alert">
              {errorMessage}
            </p>
          )}
        </section>

        {isLoading && (
          <div className="loading-state" role="status" aria-live="polite">
            <span className="loading-spinner" />
            <span>Crafting a concise draft...</span>
          </div>
        )}

        {apiResponse && (
          <section
            ref={articleRef}
            className="article-card"
            aria-label="Generated article"
            tabIndex={-1}
          >
            <div className="article-toolbar">
              <div className="article-meta">
                <span className="generated-status">
                  <span className="status-dot" />
                  Draft ready
                </span>
                <span className="word-count">
                  {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
                </span>
              </div>
              <div className="article-actions">
                {copyStatus && (
                  <span className="copy-status" role="status" aria-live="polite">
                    {copyStatus}
                  </span>
                )}
                <button
                  className="copy-button"
                  type="button"
                  onClick={() => void copyArticle()}
                >
                  <span className="copy-icon" aria-hidden="true">
                    ▢
                  </span>
                  Copy article
                </button>
              </div>
            </div>
            <article className="article-content">
              <div className="article-kicker">
                <span className="sparkle" aria-hidden="true">
                  ✦
                </span>
                Your concise draft
              </div>
              <div className="article-body">{renderArticle(apiResponse)}</div>
            </article>
          </section>
        )}
        <section className="safeguards-card" aria-labelledby="safeguards-title">
          <div className="safeguards-heading">
            <span className="safeguards-icon" aria-hidden="true">
              ◈
            </span>
            <div>
              <p className="safeguards-eyebrow">Built for focused drafting</p>
              <h2 id="safeguards-title">Prompt limits &amp; AI guardrails</h2>
            </div>
          </div>
          <ul className="safeguards-list">
            <li>
              <span className="safeguard-check" aria-hidden="true">✓</span>
              Topics are limited to 3–500 characters and checked on both the
              page and server.
            </li>
            <li>
              <span className="safeguard-check" aria-hidden="true">✓</span>
              Each account gets up to 5 generation attempts per UTC day.
            </li>
            <li>
              <span className="safeguard-check" aria-hidden="true">✓</span>
              Drafts target 150–220 words, with a hard cap of 450 output tokens.
            </li>
            <li>
              <span className="safeguard-check" aria-hidden="true">✓</span>
              Prompts ask the model to ignore instruction overrides, avoid
              unsupported claims, and refuse harmful or illegal instructions.
            </li>
            <li>
              <span className="safeguard-check" aria-hidden="true">✓</span>
              Generated drafts omit author names, bios, and signatures.
            </li>
          </ul>
          <p className="safeguards-note">
            AI guardrails guide model responses; they cannot guarantee every
            result is accurate or safe.
          </p>
        </section>
        </>
        )}
      </main>
    </div>
  );
};

export default HomePage;
