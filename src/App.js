import React, { useState, useEffect } from "react";
import "./App.css";

// ── HELPERS ──
const TODAY = new Date().toDateString();
const getStorage = (key, def) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } };
const setStorage = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const BASE = "http://127.0.0.1:8000";

const POPULAR_TAGS = ["dp", "graphs", "greedy", "math", "trees", "binary search", "strings", "sorting"];

const getDiff = (r) => {
  if (!r)    return { label: "Unrated", cls: "diff-unrated" };
  if (r <= 1000) return { label: "Easy",   cls: "diff-easy"   };
  if (r <= 1600) return { label: "Medium", cls: "diff-medium" };
  if (r <= 2200) return { label: "Hard",   cls: "diff-hard"   };
  return           { label: "Expert", cls: "diff-expert" };
};

export default function App() {

  // ── SEARCH STATE ──
  const [tag, setTag]             = useState("");
  const [contestId, setContestId] = useState("");
  const [limit, setLimit]         = useState(10);
  const [minRating, setMinRating] = useState(800);
  const [maxRating, setMaxRating] = useState(1600);
  const [sortBy, setSortBy]       = useState("rating-asc");
  const [exactMatch, setExactMatch] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [searched, setSearched]   = useState(false);

  // ── ENDPOINT 2: /tags state ──
  const [allTags, setAllTags]       = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsLoaded, setTagsLoaded]   = useState(false);

  // ── ENDPOINT 3: /problem state ──
  const [lookupContestId, setLookupContestId] = useState("");
  const [lookupIndex, setLookupIndex]         = useState("");
  const [singleProblem, setSingleProblem]     = useState(null);
  const [singleLoading, setSingleLoading]     = useState(false);
  const [singleError, setSingleError]         = useState("");

  // ── TRACKER STATE ──
  const [activeTab, setActiveTab] = useState("search");
  const [solvedMap, setSolvedMap] = useState(() => getStorage("tf_solved", {}));
  const [streak, setStreak]       = useState(() => getStorage("tf_streak", { count: 0, last: "" }));
  const [stats, setStats]         = useState({ easy: 0, medium: 0, hard: 0, expert: 0 });

  // ── STREAK CHECK ──
  useEffect(() => {
    const s = getStorage("tf_streak", { count: 0, last: "" });
    if (s.last === TODAY) { setStreak(s); return; }
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const stillGoing = s.last === yesterday.toDateString();
    const updated = { count: stillGoing ? s.count : 0, last: s.last };
    setStreak(updated); setStorage("tf_streak", updated);
  }, []);

  // ── STATS UPDATE ──
  useEffect(() => {
    const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
    Object.values(solvedMap).forEach(({ status, rating }) => {
      if (status !== "solved") return;
      const d = getDiff(rating);
      if (d.cls === "diff-easy")   counts.easy++;
      else if (d.cls === "diff-medium") counts.medium++;
      else if (d.cls === "diff-hard")   counts.hard++;
      else if (d.cls === "diff-expert") counts.expert++;
    });
    setStats(counts);
  }, [solvedMap]);

  // ════════════════════════════════════════
  // ENDPOINT 1 — GET /questions
  // Called when: user clicks "Search Problems"
  // Sends: tag, contest_id, min_rating as query params
  // Returns: filtered list of problems
  // ════════════════════════════════════════
  const fetchQuestions = async () => {
    if (!tag) { setError("Please enter a topic tag"); return; }
    setError(""); setLoading(true); setQuestions([]); setSearched(true);
    try {
      const url = `${BASE}/questions?tag=${encodeURIComponent(tag)}&min_rating=${minRating}${contestId ? `&contest_id=${contestId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server error ${res.status} — is your FastAPI running on port 8000?`);
      let data = await res.json();
      if (!Array.isArray(data)) data = [];

      // ── EXACT TAG MATCH — core feature of TagForce ──
      // Codeforces returns problems that HAVE this tag among others
      // We filter to ONLY problems where this tag is the single tag
      if (exactMatch) {
        data = data.filter(q =>
          Array.isArray(q.tags) &&
          q.tags.length === 1 &&
          q.tags[0] === tag
        );
      }

      // rating range filter
      data = data.filter(q =>
        !q.rating || (q.rating >= parseInt(minRating) && q.rating <= parseInt(maxRating))
      );

      // sort
      if (sortBy === "rating-asc")  data.sort((a, b) => (a.rating || 0) - (b.rating || 0));
      if (sortBy === "rating-desc") data.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      if (sortBy === "name")        data.sort((a, b) => a.name.localeCompare(b.name));

      setQuestions(data.slice(0, parseInt(limit)));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ════════════════════════════════════════
  // ENDPOINT 2 — GET /tags
  // Called when: user clicks "Browse All Tags" button
  // Sends: nothing (no parameters needed)
  // Returns: list of all available Codeforces tags
  // ════════════════════════════════════════
  const fetchAllTags = async () => {
    if (tagsLoaded) return; // already loaded, don't call again
    setTagsLoading(true);
    try {
      const res = await fetch(`${BASE}/tags`);
      if (!res.ok) throw new Error("Could not fetch tags");
      const data = await res.json();
      setAllTags(Array.isArray(data) ? data : []);
      setTagsLoaded(true);
    } catch (err) {
      // if /tags endpoint not ready, use popular tags as fallback
      setAllTags(POPULAR_TAGS);
      setTagsLoaded(true);
    } finally { setTagsLoading(false); }
  };

  // ════════════════════════════════════════
  // ENDPOINT 3 — GET /problem/{contest_id}/{index}
  // Called when: user clicks "Look Up Problem"
  // Sends: contest_id and index IN THE URL PATH (not query params)
  // Returns: one specific problem object
  // ════════════════════════════════════════
  const fetchSingleProblem = async () => {
    if (!lookupContestId || !lookupIndex) {
      setSingleError("Enter both Contest ID and Problem Index (e.g. A, B, C)");
      return;
    }
    setSingleError(""); setSingleLoading(true); setSingleProblem(null);
    try {
      // Path parameters — contest_id and index are IN the URL path itself
      const url = `${BASE}/problem/${lookupContestId}/${lookupIndex.toUpperCase()}`;
      const res = await fetch(url);
      if (res.status === 404) throw new Error(`Problem ${lookupContestId}/${lookupIndex.toUpperCase()} not found`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setSingleProblem(data);
    } catch (err) { setSingleError(err.message); }
    finally { setSingleLoading(false); }
  };

  // ── TRACKER HELPERS ──
  const markStatus = (problem, status) => {
    const key = `${problem.contestId}-${problem.index}`;
    const prev = solvedMap[key]?.status;
    const newStatus = prev === status ? null : status;
    const updated = { ...solvedMap };
    if (newStatus) updated[key] = { status: newStatus, rating: problem.rating, name: problem.name };
    else delete updated[key];
    setSolvedMap(updated); setStorage("tf_solved", updated);
    if (newStatus === "solved") {
      const s = getStorage("tf_streak", { count: 0, last: "" });
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const newCount = s.last === TODAY ? s.count : (s.last === yesterday.toDateString() ? s.count + 1 : 1);
      const u2 = { count: newCount, last: TODAY };
      setStreak(u2); setStorage("tf_streak", u2);
    }
  };
  const getStatus = (p) => solvedMap[`${p.contestId}-${p.index}`]?.status || null;
  const totalSolved    = Object.values(solvedMap).filter(v => v.status === "solved").length;
  const totalAttempted = Object.values(solvedMap).filter(v => v.status === "attempted").length;

  return (
    <div className="app">

      {/* ── HEADER ── */}
      <header className="header">
        <div className="wrap">
          <div className="header-top">
            <div className="logo">
              <span className="logo-icon">{"{}"}</span>
              <span className="logo-name">TagForce</span>
            </div>
            <div className="streak-pill">
              <span className="fire">◆</span>
              <span className="streak-n">{streak.count}</span>
              <span className="streak-l">day streak</span>
            </div>
          </div>
          <p className="tagline">Exact-match Codeforces practice · No mixed tags · No noise</p>
          <div className="endpoint-badges">
            <span className="ep-badge ep-1">GET /questions</span>
            <span className="ep-badge ep-2">GET /tags</span>
            <span className="ep-badge ep-3">GET /problem/{"{id}/{index}"}</span>
          </div>
        </div>
      </header>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="wrap nav-inner">
          {[
            { id: "search",  label: "Search"                          },
            { id: "tags",    label: "Browse Tags"                     },
            { id: "lookup",  label: "Problem Lookup"                  },
            { id: "tracker", label: `Tracker · ${totalSolved} solved` },
          ].map(t => (
            <button key={t.id}
              className={`nav-tab ${activeTab === t.id ? "nav-on" : ""}`}
              onClick={() => {
                setActiveTab(t.id);
                if (t.id === "tags") fetchAllTags();
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="main wrap">

        {/* ════════ TAB 1: SEARCH — uses Endpoint 1 ════════ */}
        {activeTab === "search" && (
          <>
            <div className="ep-banner ep-banner-1">
              <span className="ep-tag">Endpoint 1</span>
              <code>GET /questions?tag=dp&amp;min_rating=800&amp;contest_id=1234</code>
              <span className="ep-desc">Fetches and filters Codeforces problems by tag, rating, and contest</span>
            </div>

            <div className="card">
              <div className="sec-label">Quick select topic</div>
              <div className="chip-row">
                {POPULAR_TAGS.map(t => (
                  <button key={t} className={`chip ${tag === t ? "chip-on" : ""}`} onClick={() => setTag(t)}>{t}</button>
                ))}
              </div>

              <div className="fields-grid">
                <div className="field">
                  <label className="flabel">Topic tag *</label>
                  <input className="finput" placeholder="dp, graphs, greedy..." value={tag}
                    onChange={e => setTag(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && fetchQuestions()} />
                </div>
                <div className="field">
                  <label className="flabel">Contest ID (optional)</label>
                  <input className="finput" type="number" placeholder="e.g. 1234" value={contestId}
                    onChange={e => setContestId(e.target.value)} />
                </div>
                <div className="field">
                  <label className="flabel">Min rating</label>
                  <input className="finput" type="number" value={minRating} onChange={e => setMinRating(e.target.value)} />
                </div>
                <div className="field">
                  <label className="flabel">Max rating</label>
                  <input className="finput" type="number" value={maxRating} onChange={e => setMaxRating(e.target.value)} />
                </div>
                <div className="field">
                  <label className="flabel">Limit</label>
                  <input className="finput" type="number" value={limit} onChange={e => setLimit(e.target.value)} />
                </div>
                <div className="field">
                  <label className="flabel">Sort by</label>
                  <select className="finput" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="rating-asc">Rating ↑</option>
                    <option value="rating-desc">Rating ↓</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </div>
              </div>

              {/* ── EXACT MATCH TOGGLE — core feature ── */}
              <div className="toggle-row" onClick={() => setExactMatch(!exactMatch)}>
                <div className={`toggle ${exactMatch ? "tog-on" : ""}`}><div className="tog-knob" /></div>
                <div className="toggle-text">
                  <strong>Exact tag match</strong> — show ONLY problems where <code>"{tag || "tag"}"</code> is the single tag.
                  <span className="feature-note"> This is TagForce's core feature — Codeforces does not offer this.</span>
                </div>
              </div>

              {error && <div className="err-msg">{error}</div>}

              <div className="btn-row">
                <button className="btn-primary" onClick={fetchQuestions} disabled={loading}>
                  {loading ? "Searching..." : "Search Problems"}
                </button>
                <button className="btn-ghost" onClick={() => { setTag(""); setContestId(""); setQuestions([]); setSearched(false); setError(""); }}>
                  Clear
                </button>
              </div>
            </div>

            {loading && <div className="loading-row"><div className="spinner" /><span>Calling GET /questions...</span></div>}

            {!loading && questions.length > 0 && (
              <>
                <div className="list-header">
                  <span>
                    Results for <code className="ctag">#{tag}</code>
                    {exactMatch && <span className="badge-exact">exact match only</span>}
                  </span>
                  <span className="count-pill">{questions.length} problems</span>
                </div>
                <div className="plist">
                  {questions.map((q, i) => {
                    const d = getDiff(q.rating);
                    const st = getStatus(q);
                    return (
                      <div key={i} className={`prow ${st === "solved" ? "prow-solved" : st === "attempted" ? "prow-attempted" : ""}`}>
                        <span className="pidx">{i + 1}</span>
                        <div className="pmeta">
                          <a href={q.url} target="_blank" rel="noreferrer" className="plink">{q.name}</a>
                          <div className="ptag-row">{q.tags.map(t => <span key={t} className="ptag">{t}</span>)}</div>
                        </div>
                        <div className="pright">
                          <span className={`dbadge ${d.cls}`}>{d.label}</span>
                          <span className="prating">{q.rating || "?"}</span>
                          <div className="pbtns">
                            <button title="Solved"   className={`pbtn ${st === "solved"    ? "pbtn-green" : ""}`} onClick={() => markStatus(q, "solved")}>✓</button>
                            <button title="Attempted"className={`pbtn ${st === "attempted" ? "pbtn-amber" : ""}`} onClick={() => markStatus(q, "attempted")}>~</button>
                            <button title="Skip"     className={`pbtn ${st === "skipped"   ? "pbtn-red"  : ""}`} onClick={() => markStatus(q, "skipped")}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!loading && searched && questions.length === 0 && !error && (
              <div className="empty-state">
                <div className="empty-icon">( )</div>
                <div className="empty-title">No problems found</div>
                <div className="empty-sub">Try turning off Exact match, or widen your rating range</div>
              </div>
            )}
          </>
        )}

        {/* ════════ TAB 2: BROWSE TAGS — uses Endpoint 2 ════════ */}
        {activeTab === "tags" && (
          <>
            <div className="ep-banner ep-banner-2">
              <span className="ep-tag">Endpoint 2</span>
              <code>GET /tags</code>
              <span className="ep-desc">Fetches all available topic tags from Codeforces — no parameters needed</span>
            </div>

            <div className="card">
              <div className="sec-label">All Codeforces tags</div>
              <p className="plan-desc">
                This calls <code>GET /tags</code> on your FastAPI server which fetches every unique tag
                from the Codeforces problem set. Click any tag to search for it instantly.
              </p>
              <div className="btn-row" style={{marginBottom:"20px"}}>
                <button className="btn-primary" onClick={fetchAllTags} disabled={tagsLoading}>
                  {tagsLoading ? "Fetching tags..." : tagsLoaded ? "Reload Tags" : "Load All Tags"}
                </button>
              </div>

              {tagsLoading && <div className="loading-row"><div className="spinner" /><span>Calling GET /tags...</span></div>}

              {!tagsLoading && tagsLoaded && (
                <>
                  <div style={{fontSize:"12px",color:"var(--t3)",marginBottom:"12px",fontFamily:"monospace"}}>
                    {allTags.length} tags loaded from /tags endpoint
                  </div>
                  <div className="all-tags-grid">
                    {allTags.map(t => (
                      <button key={t} className="tag-btn"
                        onClick={() => { setTag(t); setActiveTab("search"); }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!tagsLoading && !tagsLoaded && (
                <div className="empty-state">
                  <div className="empty-icon">[ ]</div>
                  <div className="empty-title">Click "Load All Tags" to call the /tags endpoint</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════ TAB 3: PROBLEM LOOKUP — uses Endpoint 3 ════════ */}
        {activeTab === "lookup" && (
          <>
            <div className="ep-banner ep-banner-3">
              <span className="ep-tag">Endpoint 3</span>
              <code>GET /problem/{"{contest_id}/{index}"}</code>
              <span className="ep-desc">Fetches one specific problem using path parameters in the URL</span>
            </div>

            <div className="card">
              <div className="sec-label">Look up a specific problem</div>
              <p className="plan-desc">
                Enter a Contest ID and Problem Index. This calls <code>GET /problem/contestId/index</code> —
                the contest ID and index are <strong>path parameters</strong> (inside the URL itself, not after ?).
                For example: <code>/problem/1234/A</code>
              </p>

              <div className="fields-grid">
                <div className="field">
                  <label className="flabel">Contest ID</label>
                  <input className="finput" type="number" placeholder="e.g. 4" value={lookupContestId}
                    onChange={e => setLookupContestId(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && fetchSingleProblem()} />
                </div>
                <div className="field">
                  <label className="flabel">Problem Index</label>
                  <input className="finput" placeholder="e.g. A, B, C" value={lookupIndex}
                    onChange={e => setLookupIndex(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && fetchSingleProblem()} />
                </div>
              </div>

              <div className="url-preview">
                <span className="url-label">Will call:</span>
                <code className="url-code">
                  GET /problem/{lookupContestId || "{contest_id}"}/{lookupIndex || "{index}"}
                </code>
              </div>

              {singleError && <div className="err-msg">{singleError}</div>}

              <div className="btn-row">
                <button className="btn-primary" onClick={fetchSingleProblem} disabled={singleLoading}>
                  {singleLoading ? "Looking up..." : "Look Up Problem"}
                </button>
                <button className="btn-ghost" onClick={() => { setLookupContestId(""); setLookupIndex(""); setSingleProblem(null); setSingleError(""); }}>
                  Clear
                </button>
              </div>
            </div>

            {singleLoading && <div className="loading-row"><div className="spinner" /><span>Calling GET /problem/{lookupContestId}/{lookupIndex}...</span></div>}

            {singleProblem && (
              <div className="card single-problem-card">
                <div className="sec-label">Problem found</div>
                <div className="single-name">{singleProblem.name}</div>
                <div className="single-meta">
                  <span className={`dbadge ${getDiff(singleProblem.rating).cls}`}>{getDiff(singleProblem.rating).label}</span>
                  <span className="prating" style={{fontSize:"18px"}}>{singleProblem.rating || "Unrated"}</span>
                  <code className="ctag">#{singleProblem.contestId}/{singleProblem.index}</code>
                </div>
                <div className="ptag-row" style={{margin:"12px 0"}}>
                  {singleProblem.tags && singleProblem.tags.map(t => <span key={t} className="ptag">{t}</span>)}
                </div>
                <div className="btn-row">
                  <a href={singleProblem.url} target="_blank" rel="noreferrer"
                    className="btn-primary" style={{textDecoration:"none",display:"inline-block"}}>
                    Open on Codeforces
                  </a>
                  <button
                    className={`btn-ghost ${getStatus(singleProblem) === "solved" ? "btn-ghost-green" : ""}`}
                    onClick={() => markStatus(singleProblem, "solved")}>
                    {getStatus(singleProblem) === "solved" ? "✓ Solved" : "Mark as Solved"}
                  </button>
                </div>
              </div>
            )}

            <div className="card" style={{marginTop:"16px"}}>
              <div className="sec-label">Try these examples</div>
              <p className="plan-desc" style={{marginBottom:"14px"}}>Click any to auto-fill and look up:</p>
              {[
                { cid: "4",   idx: "A", name: "Watermelon"         },
                { cid: "71",  idx: "A", name: "Way Too Long Words"  },
                { cid: "339", idx: "A", name: "Helpful Maths"       },
                { cid: "20",  idx: "C", name: "Dijkstra?"           },
              ].map(ex => (
                <button key={ex.cid+ex.idx} className="example-btn"
                  onClick={() => { setLookupContestId(ex.cid); setLookupIndex(ex.idx); setSingleProblem(null); setSingleError(""); }}>
                  <code>{ex.cid}/{ex.idx}</code>
                  <span>{ex.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ════════ TAB 4: TRACKER ════════ */}
        {activeTab === "tracker" && (
          <>
            <div className="stats-row">
              {[
                { num: totalSolved,    label: "Solved",    color: "green"   },
                { num: totalAttempted, label: "Attempted", color: "amber"   },
                { num: streak.count,   label: "Streak",    color: "blue"    },
                { num: Object.keys(solvedMap).length, label: "Tracked", color: "def" },
              ].map(s => (
                <div key={s.label} className="stat-box">
                  <div className={`stat-num stat-${s.color}`}>{s.num}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{marginBottom:"20px"}}>
              <div className="sec-label" style={{marginBottom:"14px"}}>Solved by difficulty</div>
              {[
                { label:"Easy",   count:stats.easy,   cls:"diff-easy"   },
                { label:"Medium", count:stats.medium, cls:"diff-medium" },
                { label:"Hard",   count:stats.hard,   cls:"diff-hard"   },
                { label:"Expert", count:stats.expert, cls:"diff-expert" },
              ].map(row => (
                <div key={row.label} className="drow">
                  <span className={`dbadge ${row.cls}`} style={{minWidth:"66px",textAlign:"center"}}>{row.label}</span>
                  <div className="dbar-wrap">
                    <div className={`dbar dbar-${row.label.toLowerCase()}`} style={{width:`${Math.min(row.count * 15, 100)}%`}} />
                  </div>
                  <span className="dcount">{row.count}</span>
                </div>
              ))}
            </div>

            <div className="sec-label" style={{marginBottom:"12px"}}>All tracked problems</div>
            {Object.keys(solvedMap).length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">[ ]</div>
                <div className="empty-title">Nothing tracked yet</div>
                <div className="empty-sub">Go to Search → find problems → click ✓ ~ ✕</div>
              </div>
            ) : (
              <div className="plist">
                {Object.entries(solvedMap).map(([key, val]) => {
                  const d = getDiff(val.rating);
                  return (
                    <div key={key} className={`prow ${val.status === "solved" ? "prow-solved" : val.status === "attempted" ? "prow-attempted" : ""}`}>
                      <div className="pmeta">
                        <span className="plink">{val.name}</span>
                        <span style={{fontSize:"11px",color:"var(--t3)",marginTop:"3px",display:"block",fontFamily:"monospace"}}>{key}</span>
                      </div>
                      <div className="pright">
                        <span className={`dbadge ${d.cls}`}>{d.label}</span>
                        <span className="prating">{val.rating || "?"}</span>
                        <span className={`status-chip status-${val.status}`}>{val.status}</span>
                        <button className="btn-ghost" style={{padding:"4px 10px",fontSize:"11px"}}
                          onClick={() => { const u={...solvedMap}; delete u[key]; setSolvedMap(u); setStorage("tf_solved",u); }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </main>

      <footer className="footer">
        TagForce · React + FastAPI · 3 endpoints: /questions · /tags · /problem · Codeforces Public API
      </footer>
    </div>
  );
}
