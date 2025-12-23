// Šipky 2025 – jednoduchá webovka bez backendu
// 2 stránky: #/view a #/edit
// Ukládání do localStorage. Vítězové = checkboxy (vzájemně se vylučují).

const LS_KEY = "sipky2025_state_v1";

// --- Central storage (Supabase) ---
const SUPABASE_URL = "https://pmukjswanfshryfkbenc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fgXRt_PBKmng71KjWIkFtg_8-MqhDMU";
const REMOTE_ID = "doskar-cup-2025";

async function remoteLoad(){
  const url =
    `${SUPABASE_URL}/rest/v1/sipky_state` +
    `?select=data,updated_at` +
    `&id=eq.${encodeURIComponent(REMOTE_ID)}` +
    `&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    }
  });

  if(!res.ok){
    console.error("Supabase load failed", res.status);
    return null;
  }

  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function remoteSave(state){
  const url = `${SUPABASE_URL}/rest/v1/sipky_state`;
  const body = { id: REMOTE_ID, data: state, updated_at: new Date().toISOString() };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(body)
  });
  return res.ok;
}


// --- Simple password protection (prompt every time) ---
const PASSWORD = "bublina";
let editAuthed = false;

function requireAuth(action){
  const modal = document.getElementById("pwModal");
  const input = document.getElementById("pwInput");
  const err = document.getElementById("pwError");
  modal.style.display = "flex";
  input.value = "";
  err.style.display = "none";
  input.focus();

  const close = () => modal.style.display = "none";

  // Make sure we don't accumulate handlers
  document.getElementById("pwCancel").onclick = (e) => { if(e){e.preventDefault(); e.stopPropagation();} close(); };
  document.getElementById("pwOk").onclick = (e) => { if(e){e.preventDefault(); e.stopPropagation();}

    if(input.value === PASSWORD){
      close();
      action();
    }else{
      err.style.display = "block";
    }
  };

  // Enter to submit
  input.onkeydown = (e) => {
    if(e.key === "Enter"){
      document.getElementById("pwOk").click();
    }
    if(e.key === "Escape"){
      close();
    }
  };
}


function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

const DEFAULT_STATE = {
  groups: {
    g1: [
      { code: "1A", name: "Mazi" },
      { code: "1B", name: "Mišák" },
      { code: "1C", name: "Dejvek" },
      { code: "1D", name: "Klozik" }
    ],
    g2: [
      { code: "2A", name: "Hansi" },
      { code: "2B", name: "Švícko" },
      { code: "2C", name: "Kuczys" },
      { code: "2D", name: "Jíťa" }
    ]
  },
  // Zápasy (žlutý blok nahoře): levá strana K/L/M, pravá O/N/P
  matches: [
    { leftCode:"2A", rightCode:"2B", winner:null },
    { leftCode:"1C", rightCode:"1D", winner:null },
    { leftCode:"2C", rightCode:"2D", winner:null },
    { leftCode:"1A", rightCode:"1C", winner:null },
    { leftCode:"1A", rightCode:"1B", winner:null },
    { leftCode:"2A", rightCode:"2C", winner:null },
    { leftCode:"1B", rightCode:"1D", winner:null },
    { leftCode:"2B", rightCode:"2D", winner:null },
    { leftCode:"1A", rightCode:"1D", winner:null },
    { leftCode:"2A", rightCode:"2D", winner:null },
    { leftCode:"1B", rightCode:"1C", winner:null },
    { leftCode:"2B", rightCode:"2C", winner:null }
  ],
  // Playoff (žlutý blok dole): 4 čtvrtfinále + 2 semifinále + finále
  playoff: {
    qf: [
      { id:"QF1", leftCode:"A1", rightCode:"C4", winner:null },
      { id:"QF2", leftCode:"A2", rightCode:"B3", winner:null },
      { id:"QF3", leftCode:"A3", rightCode:"B2", winner:null },
      { id:"QF4", leftCode:"A4", rightCode:"B1", winner:null }
    ],
    sf: [
      { id:"SF1", leftFrom:"QF1", rightFrom:"QF2", winner:null },
      { id:"SF2", leftFrom:"QF3", rightFrom:"QF4", winner:null }
    ],
    final: { id:"F", leftFrom:"SF1", rightFrom:"SF2", winner:null }
  }
};

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return deepClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return mergeDefaults(parsed, DEFAULT_STATE);
  }catch(e){
    return deepClone(DEFAULT_STATE);
  }
}

function saveState(state){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function mergeDefaults(obj, defaults){
  // jednoduchý „deep merge“: když něco chybí, doplní se z defaultu
  if(obj === null || obj === undefined) return deepClone(defaults);
  if(Array.isArray(defaults)){
    return Array.isArray(obj) ? obj : deepClone(defaults);
  }
  if(typeof defaults !== "object") return (obj ?? defaults);
  const out = {};
  for(const k of Object.keys(defaults)){
    out[k] = mergeDefaults(obj[k], defaults[k]);
  }
  // zachovat případné extra keys (nevadí)
  for(const k of Object.keys(obj || {})){
    if(!(k in out)) out[k] = obj[k];
  }
  return out;
}

function codeToNameMap(state){
  const m = new Map();
  for(const p of state.groups.g1) m.set(p.code, p.name);
  for(const p of state.groups.g2) m.set(p.code, p.name);
  return m;
}

function computeWins(state){
  const wins = new Map();
  const m = codeToNameMap(state);
  // init
  for(const p of [...state.groups.g1, ...state.groups.g2]) wins.set(p.code, 0);

  for(const match of state.matches){
    if(match.winner === "L") wins.set(match.leftCode, (wins.get(match.leftCode)||0) + 1);
    if(match.winner === "R") wins.set(match.rightCode, (wins.get(match.rightCode)||0) + 1);
  }
  return wins;
}

function sortedGroup(state, groupKey){
  const wins = computeWins(state);
  const arr = deepClone(state.groups[groupKey]);
  arr.forEach(p => p.wins = wins.get(p.code) || 0);
  arr.sort((a,b) => b.wins - a.wins || a.code.localeCompare(b.code, "cs"));
  return arr;
}

// Playoff pozice A1..A4 = pořadí group1, B1..B4 = pořadí group2
// C1..C4 = pořadí group2 (alias), kvůli existujícím kódům v excelu (C4 apod.)
function playoffPositionName(state, posCode){
  const g1 = sortedGroup(state, "g1"); // A
  const g2 = sortedGroup(state, "g2"); // B
  const letter = posCode?.[0];
  const idx = parseInt(posCode?.slice(1), 10) - 1;
  if(Number.isNaN(idx) || idx < 0) return "";
  if(letter === "A") return g1[idx]?.name ?? "";
  if(letter === "B") return g2[idx]?.name ?? "";
  if(letter === "C") return g2[idx]?.name ?? ""; // alias
  return "";
}

function playoffGameWinnerName(state, gameId){
  const p = state.playoff;
    const POS_CODES = ["A1","A2","A3","A4","B1","B2","B3","B4","C1","C2","C3","C4"];
    const posSelect = (value, onPick) => {
      const sel = el("select", {style:"width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--line); background:rgba(0,0,0,.25); color:var(--text)"});
      for(const code of POS_CODES){
        const opt = document.createElement("option");
        opt.value = code; opt.textContent = code + " – " + (playoffPositionName(state, code) || "—");
        if(code === value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", (e)=> onPick(e.target.value));
      return sel;
    };
  const all = new Map();
  for(const g of p.qf) all.set(g.id, g);
  for(const g of p.sf) all.set(g.id, g);
  all.set(p.final.id, p.final);

  const g = all.get(gameId);
  if(!g) return "";
  const getSideName = (side) => {
    if(g.leftCode && side==="L") return playoffPositionName(state, g.leftCode);
    if(g.rightCode && side==="R") return playoffPositionName(state, g.rightCode);
    if(g.leftFrom && side==="L") return playoffGameWinnerName(state, g.leftFrom);
    if(g.rightFrom && side==="R") return playoffGameWinnerName(state, g.rightFrom);
    return "";
  };
  if(g.winner === "L") return getSideName("L");
  if(g.winner === "R") return getSideName("R");
  return "";
}

function championName(state){
  return playoffGameWinnerName(state, state.playoff.final.id) || "";
}

function setActiveTab(){
  const hash = location.hash || "#/view";
  document.getElementById("tabView").classList.toggle("active", hash.startsWith("#/view"));
  document.getElementById("tabEdit").classList.toggle("active", hash.startsWith("#/edit"));
}

function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k === "class") node.className = v;
    else if(k === "html") node.innerHTML = v;
    else if(k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if(k === "checked" || k === "disabled" || k === "selected"){
      // boolean DOM properties (setAttribute("checked", false) would still mark it as checked)
      node[k] = !!v;
      if(!!v) node.setAttribute(k, "");
      else node.removeAttribute(k);
    }else{
      node.setAttribute(k, v);
    }
  }
  for(const ch of children){
    if(ch === null || ch === undefined) continue;
    node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return node;
}

function table(headers, rows){
  const thead = el("thead", {}, [el("tr", {}, headers.map(h => el("th", {}, [h])) )]);
  const tbody = el("tbody", {}, rows.map(r => el("tr", {}, r.map(td => el("td", td?.attrs||{}, [td?.text ?? ""])) )));
  return el("table", {}, [thead, tbody]);
}

function renderView(state){
  const map = codeToNameMap(state);
  const g1wins = computeWins(state);
  const g2wins = g1wins; // same map

  const groupTable = (title, groupKey) => {
    const grp = state.groups[groupKey];
    const rows = grp.map(p => [
      {text: p.code},
      {text: p.name},
      {text: String(computeWins(state).get(p.code) || 0), attrs:{class:"right"}}
    ]);
    return el("div", {class:"card"}, [
      el("h3", {}, [title, el("span", {class:"muted"}, ["výhry"]) ]),
      el("div", {class:"body"}, [
        table(["Kód","Hráč","W"], rows)
      ])
    ]);
  };

  const matchTable = () => {
    const rows = state.matches.map((m, i) => {
      const leftName = map.get(m.leftCode) || "";
      const rightName = map.get(m.rightCode) || "";
      const leftWin = m.winner === "L" ? "✅" : "";
      const rightWin = m.winner === "R" ? "✅" : "";
      return [
        {text: m.leftCode},
        {text: leftName},
        {text: leftWin, attrs:{class:"right"}},
        {text: rightWin, attrs:{class:"right"}},
        {text: rightName},
        {text: m.rightCode}
      ];
    });
    return el("div", {class:"card"}, [
      el("h3", {}, ["Zápasy (skupiny)"]),
      el("div", {class:"body"}, [
        table(["L kód","L hráč","L ✔","R ✔","R hráč","R kód"], rows)
      ])
    ]);
  };

  const sortedTableCard = (title, groupKey, prefixLetter) => {
    const sorted = sortedGroup(state, groupKey);
    const rows = sorted.map((p, idx) => [
      {text: `${prefixLetter}${idx+1}`},
      {text: p.name},
      {text: String(p.wins), attrs:{class:"right"}}
    ]);
    return el("div", {class:"card"}, [
      el("h3", {}, [title]),
      el("div", {class:"body"}, [table(["Pozice","Hráč","W"], rows)])
    ]);
  };

  const playoffCard = () => {
    const p = state.playoff;
    const POS_CODES = ["A1","A2","A3","A4","B1","B2","B3","B4","C1","C2","C3","C4"];
    const posSelect = (value, onPick) => {
      const sel = el("select", {style:"width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--line); background:rgba(0,0,0,.25); color:var(--text)"});
      for(const code of POS_CODES){
        const opt = document.createElement("option");
        opt.value = code; opt.textContent = code + " – " + (playoffPositionName(state, code) || "—");
        if(code === value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", (e)=> onPick(e.target.value));
      return sel;
    };
    const renderGame = (label, g) => {
      const left = g.leftCode ? `${g.leftCode} – ${playoffPositionName(state, g.leftCode)}` : `${g.leftFrom} – ${playoffGameWinnerName(state, g.leftFrom)}`;
      const right = g.rightCode ? `${g.rightCode} – ${playoffPositionName(state, g.rightCode)}` : `${g.rightFrom} – ${playoffGameWinnerName(state, g.rightFrom)}`;
      const w = g.winner ? (g.winner === "L" ? left : right) : "—";
      return [label, left, right, w];
    };
    const rows = [
      ...p.qf.map(g => renderGame(g.id, g)),
      ...p.sf.map(g => renderGame(g.id, g)),
      renderGame(p.final.id, p.final),
    ].map(r => r.map((x,i)=> ({text:x, attrs: i===3?{class:"right"}:{}})));

    return el("div", {class:"card"}, [
      el("h3", {}, ["Playoff"]),
      el("div", {class:"body"}, [
        table(["Zápas","Levá strana","Pravá strana","Vítěz"], rows),
        el("div", {style:"margin-top:12px;font-size:18px;font-weight:800;"}, [
          championName(state) ? `Vítězem je: ${championName(state)}` : "Vítězem je: —"
        ])
      ])
    ]);
  };

  return el("div", {class:"grid"}, [
    el("div", {}, [
      groupTable("Group 1", "g1"),
      el("div", {style:"height:12px"}),
      groupTable("Group 2", "g2")
    ]),
    el("div", {}, [matchTable(), el("div", {style:"height:12px"}), playoffCard()]),
    el("div", {}, [
      sortedTableCard("Group 1 Sorted", "g1", "A"),
      el("div", {style:"height:12px"}),
      sortedTableCard("Group 2 Sorted", "g2", "B")
    ])
  ]);
}

function renderEdit(state, onChange){
  const map = codeToNameMap(state);

  const groupsEditor = () => {
    const block = (title, groupKey) => {
      const grp = state.groups[groupKey];
      const rows = grp.map((p, idx) => {
        const input = el("input", {
          type:"text",
          value: p.name,
          oninput: (e) => {
            state.groups[groupKey][idx].name = e.target.value;
            onChange();
          }
        });
        return el("tr", {}, [
          el("td", {}, [p.code]),
          el("td", {}, [input])
        ]);
      });
      const tbl = el("table", {}, [
        el("thead", {}, [el("tr", {}, [el("th", {}, ["Kód"]), el("th", {}, ["Jméno (editable)"])])]),
        el("tbody", {}, rows)
      ]);
      return el("div", {class:"card"}, [
        el("h3", {}, [title]),
        el("div", {class:"body"}, [tbl])
      ]);
    };

    return el("div", {class:"twoCol"}, [
      block("Group 1 – edit jmen (červený blok)", "g1"),
      block("Group 2 – edit jmen (červený blok)", "g2"),
    ]);
  };

  const matchesEditor = () => {
    const rows = state.matches.map((m, i) => {
      const leftName = map.get(m.leftCode) || "";
      const rightName = map.get(m.rightCode) || "";

      const leftChk = el("input", {
        type:"checkbox", class:"chk",
        checked: m.winner === "L",
        onchange: (e) => {
          m.winner = e.target.checked ? "L" : null;
          if(e.target.checked) m.winner = "L";
          onChange();
        }
      });
      const rightChk = el("input", {
        type:"checkbox", class:"chk",
        checked: m.winner === "R",
        onchange: (e) => {
          m.winner = e.target.checked ? "R" : null;
          onChange();
        }
      });

      // Vzájemné vyloučení (aby nebyly oba)
      leftChk.addEventListener("change", () => {
        if(leftChk.checked){ m.winner="L"; rightChk.checked=false; }
        onChange();
      });
      rightChk.addEventListener("change", () => {
        if(rightChk.checked){ m.winner="R"; leftChk.checked=false; }
        onChange();
      });

      return el("tr", {}, [
        el("td", {}, [m.leftCode]),
        el("td", {}, [leftName]),
        el("td", {class:"right"}, [leftChk]),
        el("td", {class:"right"}, [rightChk]),
        el("td", {}, [rightName]),
        el("td", {}, [m.rightCode]),
      ]);
    });

    const tbl = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["L kód"]),
        el("th", {}, ["L hráč"]),
        el("th", {class:"right"}, ["L ✔"]),
        el("th", {class:"right"}, ["R ✔"]),
        el("th", {}, ["R hráč"]),
        el("th", {}, ["R kód"]),
      ])]),
      el("tbody", {}, rows)
    ]);

    return el("div", {class:"card"}, [
      el("h3", {}, ["Zápasy – checkboxy (žlutý blok nahoře)"]),
      el("div", {class:"body"}, [tbl])
    ]);
  };

  const playoffEditor = () => {
    const p = state.playoff;
    const POS_CODES = ["A1","A2","A3","A4","B1","B2","B3","B4","C1","C2","C3","C4"];
    const posSelect = (value, onPick) => {
      const sel = el("select", {style:"width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--line); background:rgba(0,0,0,.25); color:var(--text)"});
      for(const code of POS_CODES){
        const opt = document.createElement("option");
        opt.value = code; opt.textContent = code + " – " + (playoffPositionName(state, code) || "—");
        if(code === value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", (e)=> onPick(e.target.value));
      return sel;
    };

    const gameRow = (g) => {
      const leftLabel = `${g.leftCode} – ${playoffPositionName(state, g.leftCode)}`;
      const rightLabel = `${g.rightCode} – ${playoffPositionName(state, g.rightCode)}`;
      const leftChk = el("input", {type:"checkbox", class:"chk", checked: g.winner==="L"});
      const rightChk = el("input", {type:"checkbox", class:"chk", checked: g.winner==="R"});

      leftChk.addEventListener("change", () => {
        if(leftChk.checked){ g.winner="L"; rightChk.checked=false; } else { g.winner=null; }
        onChange();
      });
      rightChk.addEventListener("change", () => {
        if(rightChk.checked){ g.winner="R"; leftChk.checked=false; } else { g.winner=null; }
        onChange();
      });

      return el("tr", {}, [
        el("td", {}, [g.id]),
        el("td", {}, [leftLabel]),
        el("td", {class:"right"}, [leftChk]),
        el("td", {class:"right"}, [rightChk]),
        el("td", {}, [rightLabel]),
      ]);
    };

        const qfConfigRows = p.qf.map((g) => {
      const leftSel = posSelect(g.leftCode, (v)=>{ g.leftCode=v; onChange(); });
      const rightSel = posSelect(g.rightCode, (v)=>{ g.rightCode=v; onChange(); });
      return el("tr", {}, [
        el("td", {}, [g.id]),
        el("td", {}, [leftSel]),
        el("td", {}, [rightSel]),
      ]);
    });

    const qfConfigTbl = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["QF"]),
        el("th", {}, ["Levá pozice"]),
        el("th", {}, ["Pravá pozice"]),
      ])]),
      el("tbody", {}, qfConfigRows)
    ]);

    const qfTbl = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["QF"]),
        el("th", {}, ["Levá strana"]),
        el("th", {class:"right"}, ["L ✔"]),
        el("th", {class:"right"}, ["R ✔"]),
        el("th", {}, ["Pravá strana"]),
      ])]),
      el("tbody", {}, p.qf.map(gameRow))
    ]);

    // Semifinále & finále se berou z vítězů předchozích
    const sfRow = (g) => {
      const leftLabel = `${g.leftFrom} – ${playoffGameWinnerName(state, g.leftFrom) || "—"}`;
      const rightLabel = `${g.rightFrom} – ${playoffGameWinnerName(state, g.rightFrom) || "—"}`;
      const leftChk = el("input", {type:"checkbox", class:"chk", checked: g.winner==="L"});
      const rightChk = el("input", {type:"checkbox", class:"chk", checked: g.winner==="R"});
      leftChk.addEventListener("change", () => {
        if(leftChk.checked){ g.winner="L"; rightChk.checked=false; } else { g.winner=null; }
        onChange();
      });
      rightChk.addEventListener("change", () => {
        if(rightChk.checked){ g.winner="R"; leftChk.checked=false; } else { g.winner=null; }
        onChange();
      });
      return el("tr", {}, [
        el("td", {}, [g.id]),
        el("td", {}, [leftLabel]),
        el("td", {class:"right"}, [leftChk]),
        el("td", {class:"right"}, [rightChk]),
        el("td", {}, [rightLabel]),
      ]);
    };

    const sfTbl = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["SF"]),
        el("th", {}, ["Levá strana (vítěz QF)"]),
        el("th", {class:"right"}, ["L ✔"]),
        el("th", {class:"right"}, ["R ✔"]),
        el("th", {}, ["Pravá strana (vítěz QF)"]),
      ])]),
      el("tbody", {}, p.sf.map(sfRow))
    ]);

    const f = p.final;
    const finalTbl = el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, ["FINÁLE"]),
        el("th", {}, ["Levá strana (vítěz SF)"]),
        el("th", {class:"right"}, ["L ✔"]),
        el("th", {class:"right"}, ["R ✔"]),
        el("th", {}, ["Pravá strana (vítěz SF)"]),
      ])]),
      el("tbody", {}, [sfRow(f)])
    ]);

    return el("div", {class:"card"}, [
      el("h3", {}, ["Playoff – checkboxy (žlutý blok dole)"]),
      el("div", {class:"body"}, [
        el("div", {class:"muted", style:"margin-bottom:8px"}, [
          "Pozice A1..A4 = pořadí Group 1, B1..B4 = pořadí Group 2. C1..C4 je alias pro Group 2 (kvůli kódu C4 v Excelu)."
        ]),
        el("div", {style:"margin:10px 0"}, [
          el("div", {class:"muted", style:"margin-bottom:6px"}, ["Nastavení pavouka (kdo s kým v QF):"]),
          qfConfigTbl
        ]),
        el("div", {style:"margin-bottom:10px"}, [qfTbl]),
        el("div", {style:"margin-bottom:10px"}, [sfTbl]),
        finalTbl,
        el("div", {style:"margin-top:12px;font-size:20px;font-weight:900;"}, [
          championName(state) ? `Vítězem je: ${championName(state)}` : "Vítězem je: —"
        ])
      ])
    ]);
  };

  return el("div", {}, [
    groupsEditor(),
    el("div", {style:"height:12px"}),
    matchesEditor(),
    el("div", {style:"height:12px"}),
    playoffEditor()
  ]);
}

let STATE = loadState();

function updatePill(){
  const pill = document.getElementById("statePill");
  const has = localStorage.getItem(LS_KEY);
  pill.textContent = has ? "stav uložen" : "bez uloženého stavu";
}

function render(){
  setActiveTab();
  updatePill();

  const app = document.getElementById("app");
  app.innerHTML = "";
  const hash = location.hash || "#/view";

  const onChange = () => {
    // po každé změně překreslit
    render();
  };

  if(hash.startsWith("#/edit")){
    // prompt only when entering Editace from elsewhere
    if(!editAuthed){
      requireAuth(() => {
        editAuthed = true;
        app.innerHTML = "";
        app.appendChild(renderEdit(STATE, onChange));
        setActiveTab();
        updatePill();
      });
    }else{
      app.appendChild(renderEdit(STATE, onChange));
    }
  }else{
    // leaving edit -> lock again for next entry
    editAuthed = false;
    app.appendChild(renderView(STATE));
  }
}

window.addEventListener("hashchange", render);

// Prompt on every click to "Editace" tab (even if already on edit)
document.getElementById("tabEdit").addEventListener("click", (e) => {
  // If already in Editace, don't ask again
  if((location.hash || "#/view").startsWith("#/edit")) return;
  e.preventDefault();
  requireAuth(() => { location.hash = "#/edit"; });
});
document.getElementById("tabView").addEventListener("click", (e) => {
  // normal navigation
});

document.getElementById("btnSave").addEventListener("click", () => {
  requireAuth(async () => {
    const ok = await remoteSave(STATE);
    saveState(STATE); // local cache / fallback
    updatePill(ok ? "uloženo do cloudu" : "cloud chyba");
  });
});

document.getElementById("btnReset").addEventListener("click", () => {
  requireAuth(async () => {
    if(!confirm("Opravdu chceš resetovat stav turnaje?")) return;
    STATE = deepClone(DEFAULT_STATE);
    const ok = await remoteSave(STATE);
    saveState(STATE);
    updatePill(ok ? "reset v cloudu" : "cloud chyba");
    render();
  });
});


// --- Init: load state from Supabase (cloud) with local fallback ---
(async () => {
  try{
    const remote = await remoteLoad();
    if(remote && remote.data){
      STATE = mergeDefaults(remote.data, DEFAULT_STATE);
      saveState(STATE);
      updatePill("načteno z cloudu");
    }else{
      const local = loadState();
      if(local){
        STATE = mergeDefaults(local, DEFAULT_STATE);
        updatePill("načteno lokálně");
      }else{
        updatePill();
      }
    }
  }catch(e){
    const local = loadState();
    if(local){
      STATE = mergeDefaults(local, DEFAULT_STATE);
      updatePill("offline (lokálně)");
    }else{
      updatePill("offline");
    }
  }
  render();
})();

