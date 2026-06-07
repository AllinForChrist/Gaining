import { useState, useEffect, useRef } from "react";

const T = {
  bg: "#080909", surface: "#0f1010", card: "#141515", card2: "#1a1b1b",
  border: "#242525", borderHi: "#2e2f2f", text: "#eef0ee", muted: "#4a4f4a",
  mutedHi: "#6b726b", orange: "#FF6B35", green: "#7EC850", blue: "#4DBFFF",
  yellow: "#F5C842", purple: "#B97FFF", red: "#FF5555",
};

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const TRAINING = { Monday:true,Tuesday:false,Wednesday:true,Thursday:false,Friday:true,Saturday:true,Sunday:false };

const MEAL_TEMPLATES = {
  workday: [
    {
      id:"m1", occasion:"Meal 1", time:"6:00 AM", name:"Overnight Oats + Eggs",
      grab:true, color:T.orange,
      foods:["½ cup rolled oats","1 cup Greek yogurt","1 tbsp peanut butter","½ cup frozen strawberries","1 banana","4 hard boiled eggs"],
      cal:822, protein:59, carbs:79, fat:35,
      prepNote:"Jar prepped the night before. Eggs boiled on Sunday.",
      aiDescription:"overnight oats in a jar with Greek yogurt, peanut butter, strawberries, banana, and hard boiled eggs"
    },
    {
      id:"m2", occasion:"Snack", time:"Midday", name:"Work Snack",
      grab:true, color:T.blue,
      foods:["1 cup cottage cheese","1 banana","2 tbsp peanut butter"],
      cal:460, protein:34, carbs:29, fat:21,
      prepNote:"Pack in a container before leaving. Zero prep.",
      aiDescription:"cottage cheese with banana and peanut butter"
    },
    {
      id:"m3", occasion:"Meal 2", time:"Home — whenever", name:"Dinner",
      grab:false, color:T.purple,
      foods:["9oz protein (chicken/turkey/beef)","2 cups jasmine rice cooked","1 cup veg (broccoli/mixed)","½ cup black beans","2 slices whole grain bread","1 tbsp olive oil + ½ tbsp butter"],
      cal:1303, protein:90, carbs:185, fat:33,
      prepNote:"On training nights: eat after workout. Rest days: eat whenever.",
      aiDescription:"rice bowl with meat (chicken, turkey, or ground beef), vegetables, black beans, and bread"
    },
  ],
  weekend: [
    {
      id:"m1", occasion:"Meal 1", time:"7:30 AM", name:"Big Cooked Breakfast",
      grab:false, color:T.orange,
      foods:["4 eggs scrambled","½ cup rolled oats","1 banana","2 tbsp peanut butter","½ tbsp butter"],
      cal:801, protein:46, carbs:95, fat:35,
      prepNote:"Weekend — no rush. 15 min cook.",
      aiDescription:"scrambled eggs with oatmeal, banana, and peanut butter"
    },
    {
      id:"m2", occasion:"Snack", time:"Midday", name:"Midday Snack",
      grab:true, color:T.blue,
      foods:["1 cup Greek yogurt","1 cup cottage cheese","1 banana","1 tbsp peanut butter"],
      cal:495, protein:63, carbs:42, fat:14,
      prepNote:"From fridge. Mix together or eat separately.",
      aiDescription:"Greek yogurt and cottage cheese with banana and peanut butter"
    },
    {
      id:"m3", occasion:"Meal 2", time:"After workout / Evening", name:"Post-Workout Dinner",
      grab:false, color:T.purple,
      foods:["9oz protein (chicken/turkey/beef)","2 cups jasmine rice cooked","¾ cup quinoa cooked","1 cup veg","2 slices whole grain bread","1 tbsp olive oil + 1 tbsp butter"],
      cal:1403, protein:97, carbs:190, fat:38,
      prepNote:"Biggest meal of the weekend. Sunday: jar Monday's overnight oats after eating.",
      aiDescription:"large rice and quinoa bowl with meat, vegetables, and bread"
    },
  ],
};

function getMeals(d) { return ["Saturday","Sunday"].includes(d) ? MEAL_TEMPLATES.weekend : MEAL_TEMPLATES.workday; }
function getTodayName() { return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]; }
function getWeekKey() {
  const now = new Date(), d = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - ((d+6)%7));
  return `week_${mon.toISOString().slice(0,10)}`;
}
function getMealKey(day, id) { return `${getWeekKey()}_${day}_${id}`; }

// ── AI FOOD ANALYSIS ──────────────────────────────────────────────────────────
async function analyzeFoodPhoto(base64Image, meal) {
  const prompt = `You are a meal verification assistant for a fitness meal plan.

The user is supposed to have eaten: "${meal.name}"
Which consists of: ${meal.foods.join(", ")}
In simple terms this looks like: ${meal.aiDescription}

Look at this photo and determine:
1. Does this photo show food/a meal?
2. Does it reasonably match the expected meal described above?
3. What foods do you see in the photo?

Be lenient — if the meal is roughly correct (e.g. right proteins and carbs even if portions differ slightly), consider it a match. Home-cooked meals won't look perfect.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "isFood": true or false,
  "isMatch": true or false,
  "confidence": "high", "medium", or "low",
  "foodsSeen": ["food1", "food2"],
  "matchReason": "brief explanation of why it matches or doesn't",
  "encouragement": "short motivational message (max 10 words)"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image.replace(/^data:image\/\w+;base64,/, "") } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return { isFood: true, isMatch: true, confidence: "low", foodsSeen: [], matchReason: "Could not analyze — logged anyway.", encouragement: "Keep it up!" };
  }
}

// ── CAMERA MODAL ──────────────────────────────────────────────────────────────
function CameraModal({ meal, onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [camError, setCamError] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode:"environment" }, audio:false })
      .then(s => { setStream(s); if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setCamError(true));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const snap = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const img = c.toDataURL("image/jpeg", 0.8);
    setCaptured(img);
    stream?.getTracks().forEach(t => t.stop());
    runAnalysis(img);
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCaptured(ev.target.result); runAnalysis(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const runAnalysis = async (img) => {
    setAnalyzing(true);
    const r = await analyzeFoodPhoto(img, meal);
    setResult(r);
    setAnalyzing(false);
  };

  const retry = () => {
    setCaptured(null); setResult(null); setAnalyzing(false);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode:"environment" }, audio:false })
      .then(s => { setStream(s); if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setCamError(true));
  };

  const confirm = () => { onCapture(captured, result); onClose(); };

  const confidenceColor = result ? (result.isMatch ? T.green : T.red) : T.muted;

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000f0", zIndex:1000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ width:"100%", maxWidth:480, background:T.card, borderRadius:20, overflow:"hidden", border:`1px solid ${T.border}` }}>

        {/* Header */}
        <div style={{ padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${T.border}` }}>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:"0.05em" }}>LOG MEAL PHOTO</div>
            <div style={{ color:T.muted, fontSize:11, marginTop:2 }}>{meal.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.mutedHi, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        {/* Camera / image */}
        <div style={{ position:"relative", background:"#000", aspectRatio:"4/3" }}>
          {captured ? (
            <img src={captured} alt="meal" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          ) : camError ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, padding:24 }}>
              <div style={{ fontSize:44 }}>📷</div>
              <div style={{ color:T.mutedHi, fontSize:13, textAlign:"center" }}>Camera not available — upload from your library</div>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          )}
          <canvas ref={canvasRef} style={{ display:"none" }} />

          {/* Analyzing overlay */}
          {analyzing && (
            <div style={{ position:"absolute", inset:0, background:"#000000cc", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
              <div style={{ width:44, height:44, border:`3px solid ${T.border}`, borderTop:`3px solid ${T.green}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
              <div style={{ color:T.text, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16, letterSpacing:"0.08em" }}>ANALYZING MEAL...</div>
              <div style={{ color:T.muted, fontSize:12 }}>Checking against your meal plan</div>
              <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
            </div>
          )}

          {/* Viewfinder */}
          {!captured && !camError && (
            <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
              <div style={{ position:"absolute", top:"18%", left:"12%", right:"12%", bottom:"18%", border:`2px solid ${T.green}55`, borderRadius:12 }} />
            </div>
          )}
        </div>

        {/* AI Result */}
        {result && !analyzing && (
          <div style={{ padding:"12px 16px", background: result.isMatch ? `${T.green}11` : `${T.red}11`, borderTop:`1px solid ${result.isMatch ? T.green+"44" : T.red+"44"}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <span style={{ fontSize:24 }}>{result.isMatch ? "✅" : "⚠️"}</span>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color: result.isMatch ? T.green : T.red, letterSpacing:"0.04em" }}>
                  {result.isMatch ? "MEAL VERIFIED!" : "MEAL MISMATCH"}
                </div>
                <div style={{ color:T.mutedHi, fontSize:11, marginTop:1 }}>{result.matchReason}</div>
              </div>
            </div>

            {result.foodsSeen?.length > 0 && (
              <div style={{ marginBottom:8 }}>
                <div style={{ color:T.muted, fontSize:10, letterSpacing:"0.1em", marginBottom:4, fontFamily:"'Barlow Condensed',sans-serif" }}>DETECTED:</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {result.foodsSeen.map((f,i) => (
                    <span key={i} style={{ background:`${confidenceColor}18`, border:`1px solid ${confidenceColor}33`, color:confidenceColor, fontSize:11, padding:"2px 8px", borderRadius:20 }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {result.encouragement && (
              <div style={{ color:T.mutedHi, fontSize:12, fontStyle:"italic" }}>"{result.encouragement}"</div>
            )}
          </div>
        )}

        {/* Controls */}
        <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:8 }}>
          {captured ? (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={retry} style={{ flex:1, padding:"11px", borderRadius:12, border:`1px solid ${T.border}`, background:T.card2, color:T.mutedHi, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, cursor:"pointer", letterSpacing:"0.05em" }}>
                RETAKE
              </button>
              <button onClick={confirm} disabled={analyzing} style={{ flex:2, padding:"11px", borderRadius:12, border:"none", background: analyzing ? T.muted : result?.isMatch !== false ? T.green : T.orange, color: analyzing ? T.mutedHi : "#0a0a0a", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, cursor: analyzing ? "not-allowed" : "pointer", letterSpacing:"0.05em" }}>
                {analyzing ? "ANALYZING..." : result?.isMatch ? "✓ LOG MEAL" : "LOG ANYWAY"}
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8 }}>
              {!camError && (
                <button onClick={snap} style={{ flex:2, padding:"13px", borderRadius:12, border:"none", background:T.orange, color:"#fff", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:15, cursor:"pointer", letterSpacing:"0.05em" }}>
                  📸 SNAP PHOTO
                </button>
              )}
              <button onClick={() => fileRef.current?.click()} style={{ flex:1, padding:"13px", borderRadius:12, border:`1px solid ${T.border}`, background:T.card2, color:T.text, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, cursor:"pointer", letterSpacing:"0.05em" }}>
                📁 UPLOAD
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display:"none" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MEAL CARD ─────────────────────────────────────────────────────────────────
function MealCard({ meal, dayName, logData, onLog, onUnlog }) {
  const [expanded, setExpanded] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const logged = !!logData;
  const verified = logData?.aiResult?.isMatch;

  return (
    <>
      {showCam && <CameraModal meal={meal} onCapture={(img, ai) => { onLog(meal.id, img, ai); setShowCam(false); }} onClose={() => setShowCam(false)} />}

      <div style={{ background: logged ? `${meal.color}0d` : T.card, border:`1px solid ${logged ? meal.color+"55" : T.border}`, borderRadius:14, overflow:"hidden", marginBottom:8, transition:"all 0.2s" }}>

        <div style={{ padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ flexShrink:0, background:`${meal.color}18`, border:`1px solid ${meal.color}44`, borderRadius:8, padding:"5px 10px", textAlign:"center", minWidth:60 }}>
            <div style={{ color:meal.color, fontSize:8, fontWeight:700, letterSpacing:"0.12em", fontFamily:"'Barlow Condensed',sans-serif" }}>{meal.occasion.toUpperCase()}</div>
            <div style={{ color:`${meal.color}99`, fontSize:9, marginTop:1 }}>{meal.time.split("—")[0].trim()}</div>
          </div>

          <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={() => setExpanded(!expanded)}>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16, color:T.text, letterSpacing:"0.02em" }}>{meal.name}</span>
              {meal.grab && <span style={{ background:T.border, color:T.mutedHi, fontSize:8, fontWeight:700, padding:"2px 6px", borderRadius:20, letterSpacing:"0.08em" }}>GRAB&GO</span>}
              {logged && verified && <span style={{ background:`${T.green}22`, color:T.green, fontSize:8, fontWeight:700, padding:"2px 6px", borderRadius:20 }}>✓ VERIFIED</span>}
              {logged && verified === false && <span style={{ background:`${T.yellow}22`, color:T.yellow, fontSize:8, fontWeight:700, padding:"2px 6px", borderRadius:20 }}>⚠ LOGGED</span>}
            </div>
            {!expanded && <div style={{ color:T.muted, fontSize:11, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{meal.foods.join(" · ")}</div>}
          </div>

          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ color:T.text, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16 }}>{meal.cal}</span>
              <span style={{ color:T.muted, fontSize:10 }}>cal</span>
              <span style={{ color:T.muted, cursor:"pointer", fontSize:13, transform:expanded?"rotate(180deg)":"none", transition:"0.2s", marginLeft:2 }} onClick={() => setExpanded(!expanded)}>▾</span>
            </div>
            {logged ? (
              <button onClick={() => onUnlog(meal.id)} style={{ background:`${meal.color}22`, border:`1px solid ${meal.color}66`, color:meal.color, borderRadius:8, padding:"4px 10px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.05em" }}>
                ✓ LOGGED
              </button>
            ) : (
              <button onClick={() => setShowCam(true)} style={{ background:T.orange, border:"none", color:"#fff", borderRadius:8, padding:"4px 10px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.05em" }}>
                📸 LOG
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div style={{ borderTop:`1px solid ${T.border}`, padding:"12px 16px" }}>
            {logged && logData.photo && (
              <div style={{ marginBottom:12, borderRadius:10, overflow:"hidden", border:`1px solid ${meal.color}44` }}>
                <img src={logData.photo} alt="meal" style={{ width:"100%", maxHeight:180, objectFit:"cover", display:"block" }} />
                <div style={{ background:`${meal.color}18`, padding:"7px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <span style={{ color:meal.color, fontSize:11, fontWeight:700 }}>
                      {logData.aiResult?.isMatch ? "✅ Meal verified by AI" : logData.aiResult ? "⚠️ Logged (not matched)" : "✓ Photo logged"}
                    </span>
                    {logData.aiResult?.foodsSeen?.length > 0 && (
                      <div style={{ color:T.muted, fontSize:10, marginTop:2 }}>Detected: {logData.aiResult.foodsSeen.slice(0,4).join(", ")}</div>
                    )}
                  </div>
                  <span style={{ color:T.muted, fontSize:10 }}>{logData.time}</span>
                </div>
              </div>
            )}

            <div style={{ marginBottom:12 }}>
              {meal.foods.map((food, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom: i<meal.foods.length-1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width:3, height:3, borderRadius:"50%", background:meal.color, flexShrink:0 }} />
                  <span style={{ color:T.text, fontSize:12 }}>{food}</span>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:10 }}>
              {[{l:"Cal",v:meal.cal,c:T.orange},{l:"Protein",v:meal.protein+"g",c:T.green},{l:"Carbs",v:meal.carbs+"g",c:T.blue},{l:"Fat",v:meal.fat+"g",c:T.yellow}].map((s,i) => (
                <div key={i} style={{ background:`${s.c}11`, border:`1px solid ${s.c}22`, borderRadius:8, padding:"7px 4px", textAlign:"center" }}>
                  <div style={{ color:s.c, fontWeight:700, fontSize:14, fontFamily:"'Barlow Condensed',sans-serif" }}>{s.v}</div>
                  <div style={{ color:T.muted, fontSize:9 }}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={{ background:`${meal.color}0d`, border:`1px solid ${meal.color}22`, borderRadius:8, padding:"8px 12px", fontSize:11, color:`${meal.color}cc`, lineHeight:1.5 }}>
              ⏱ {meal.prepNote}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const todayName = getTodayName();
  const todayIdx = Math.max(0, DAYS.indexOf(todayName));
  const [activeDay, setActiveDay] = useState(todayIdx);
  const [logs, setLogs] = useState({});
  const [view, setView] = useState("today");

  useEffect(() => {
    (async () => {
      try { const r = localStorage.getItem("meal_logs_v2"); if (r) setLogs(JSON.parse(r)); } catch {}
    })();
  }, []);

  const saveLogs = (nl) => {
    setLogs(nl);
    try { localStorage.setItem("meal_logs_v2", JSON.stringify(nl)); } catch {}
  };

  const handleLog = (dayName, mealId, photo, aiResult) => {
    const key = getMealKey(dayName, mealId);
    saveLogs({ ...logs, [key]: { photo, aiResult, time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) } });
  };

  const handleUnlog = (dayName, mealId) => {
    const nl = { ...logs }; delete nl[getMealKey(dayName, mealId)]; saveLogs(nl);
  };

  const currentDay = DAYS[activeDay];
  const meals = getMeals(currentDay);
  const isTraining = TRAINING[currentDay];
  const dayMacros = meals.reduce((a,m) => ({cal:a.cal+m.cal,protein:a.protein+m.protein,carbs:a.carbs+m.carbs,fat:a.fat+m.fat}), {cal:0,protein:0,carbs:0,fat:0});
  const loggedMeals = meals.filter(m => logs[getMealKey(currentDay, m.id)]);
  const loggedCals = loggedMeals.reduce((s,m) => s+m.cal, 0);
  const loggedProtein = loggedMeals.reduce((s,m) => s+m.protein, 0);
  const verifiedCount = loggedMeals.filter(m => logs[getMealKey(currentDay, m.id)]?.aiResult?.isMatch).length;

  const weekStats = DAYS.map(d => ({
    day:d, training:TRAINING[d],
    logged: getMeals(d).filter(m => logs[getMealKey(d, m.id)]).length,
    verified: getMeals(d).filter(m => logs[getMealKey(d, m.id)]?.aiResult?.isMatch).length,
    total: getMeals(d).length,
  }));
  const totalLogged = weekStats.reduce((s,d) => s+d.logged, 0);
  const totalMeals = weekStats.reduce((s,d) => s+d.total, 0);

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'DM Sans',sans-serif", paddingBottom:90 }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"20px 20px 0" }}>
        <div style={{ maxWidth:600, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:"0.22em", color:T.muted, textTransform:"uppercase", marginBottom:4, fontFamily:"'Barlow Condensed',sans-serif" }}>LEAN BULK · 153→170 LBS</div>
              <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:28, margin:0, letterSpacing:"0.02em", lineHeight:1 }}>MEAL TRACKER</h1>
              <div style={{ color:T.muted, fontSize:11, marginTop:3 }}>📸 AI-powered meal verification</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:26, color: totalLogged===totalMeals ? T.green : T.orange, lineHeight:1 }}>
                {totalLogged}<span style={{ color:T.muted, fontSize:16 }}>/{totalMeals}</span>
              </div>
              <div style={{ color:T.muted, fontSize:9, marginTop:2 }}>THIS WEEK</div>
            </div>
          </div>

          <div style={{ height:3, background:T.border, borderRadius:99, overflow:"hidden", marginBottom:14 }}>
            <div style={{ height:"100%", width:`${(totalLogged/totalMeals)*100}%`, background:`linear-gradient(90deg,${T.orange},${T.green})`, borderRadius:99, transition:"width 0.4s" }} />
          </div>

          <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.border}` }}>
            {[["today","📋","TODAY"],["week","📊","WEEK"]].map(([key,icon,label]) => (
              <button key={key} onClick={() => setView(key)} style={{ padding:"10px 18px", background:"none", border:"none", borderBottom: view===key ? `2px solid ${T.orange}` : "2px solid transparent", color: view===key ? T.orange : T.muted, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, letterSpacing:"0.08em", cursor:"pointer", marginBottom:-1 }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:600, margin:"0 auto", padding:"16px 20px 0" }}>

        {view === "today" && (
          <>
            {/* Day pills */}
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4, marginBottom:14 }}>
              {DAYS.map((d,i) => {
                const isActive = activeDay===i, isToday = d===todayName;
                const ds = weekStats[i];
                const ac = TRAINING[d] ? T.orange : T.green;
                return (
                  <button key={i} onClick={() => setActiveDay(i)} style={{ flexShrink:0, minWidth:56, padding:"8px 6px 6px", borderRadius:12, border:`1px solid ${isActive ? ac : isToday ? T.borderHi : T.border}`, background: isActive ? `${ac}15` : T.card, cursor:"pointer", textAlign:"center", position:"relative" }}>
                    {isToday && <div style={{ position:"absolute", top:4, right:4, width:5, height:5, borderRadius:"50%", background:T.orange }} />}
                    <div style={{ color:isActive ? ac : T.mutedHi, fontSize:10, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:"0.08em" }}>{d.slice(0,3).toUpperCase()}</div>
                    <div style={{ fontSize:9, marginTop:3 }}>{ds.logged===ds.total && ds.total>0 ? "✅" : ds.logged>0 ? `${ds.logged}/${ds.total}` : TRAINING[d] ? "🏋️" : "😴"}</div>
                  </button>
                );
              })}
            </div>

            {/* Day header */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"14px 16px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:22 }}>{currentDay.toUpperCase()}</span>
                  <span style={{ background: isTraining?`${T.orange}22`:`${T.green}22`, border:`1px solid ${isTraining?T.orange:T.green}44`, color: isTraining?T.orange:T.green, fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:20, fontFamily:"'Barlow Condensed',sans-serif" }}>
                    {isTraining ? "🏋️ TRAINING" : "😴 REST"}
                  </span>
                  {currentDay==="Sunday" && <span style={{ background:`${T.yellow}22`, border:`1px solid ${T.yellow}44`, color:T.yellow, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, fontFamily:"'Barlow Condensed',sans-serif" }}>📦 BATCH DAY</span>}
                </div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, color: loggedMeals.length===meals.length ? T.green : T.mutedHi }}>
                  {loggedMeals.length}/{meals.length} {loggedMeals.length===meals.length ? "✓ DONE" : "LOGGED"}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                {[{l:"CALORIES",v:dayMacros.cal,c:T.orange},{l:"PROTEIN",v:dayMacros.protein+"g",c:T.green},{l:"CARBS",v:dayMacros.carbs+"g",c:T.blue},{l:"FAT",v:dayMacros.fat+"g",c:T.yellow}].map((s,i) => (
                  <div key={i} style={{ background:`${s.c}0f`, border:`1px solid ${s.c}22`, borderRadius:8, padding:"8px 4px", textAlign:"center" }}>
                    <div style={{ color:s.c, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16 }}>{s.v}</div>
                    <div style={{ color:T.muted, fontSize:8, letterSpacing:"0.1em" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live progress */}
            {loggedMeals.length > 0 && (
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"10px 14px", marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ color:T.mutedHi, fontSize:11 }}>Logged today</span>
                  <div style={{ display:"flex", gap:10 }}>
                    <span style={{ color:T.orange, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13 }}>{loggedCals} kcal</span>
                    <span style={{ color:T.green, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13 }}>{Math.round(loggedProtein)}g protein</span>
                  </div>
                </div>
                <div style={{ height:5, background:T.border, borderRadius:99, overflow:"hidden", marginBottom:4 }}>
                  <div style={{ height:"100%", borderRadius:99, transition:"width 0.4s", background:`linear-gradient(90deg,${T.orange},${T.yellow})`, width:`${Math.min(100,(loggedCals/dayMacros.cal)*100)}%` }} />
                </div>
                {verifiedCount > 0 && (
                  <div style={{ color:T.green, fontSize:10, marginTop:4 }}>✅ {verifiedCount} meal{verifiedCount>1?"s":""} AI-verified on your plan</div>
                )}
              </div>
            )}

            {meals.map(meal => (
              <MealCard key={meal.id} meal={meal} dayName={currentDay}
                logData={logs[getMealKey(currentDay, meal.id)]}
                onLog={(id, photo, ai) => handleLog(currentDay, id, photo, ai)}
                onUnlog={(id) => handleUnlog(currentDay, id)}
              />
            ))}

            {/* PWA install tip */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"12px 14px", marginTop:14 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13, color:T.mutedHi, letterSpacing:"0.1em", marginBottom:6 }}>📱 INSTALL AS APP</div>
              <div style={{ color:T.muted, fontSize:12, lineHeight:1.6 }}>
                <strong style={{ color:T.text }}>iPhone:</strong> Tap the Share button in Safari → "Add to Home Screen"<br/>
                <strong style={{ color:T.text }}>Android:</strong> Tap the 3-dot menu → "Add to Home Screen"<br/>
                <span style={{ color:T.mutedHi }}>Opens full screen like a real app — free, no subscription needed.</span>
              </div>
            </div>
          </>
        )}

        {view === "week" && (
          <>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, color:T.muted, letterSpacing:"0.15em", marginBottom:12 }}>THIS WEEK'S PROGRESS</div>
            {weekStats.map((d,i) => {
              const pct = d.total>0 ? (d.logged/d.total)*100 : 0;
              const isToday = d.day===todayName;
              const ac = d.training ? T.orange : T.green;
              return (
                <div key={i} onClick={() => { setActiveDay(i); setView("today"); }} style={{ background: isToday?`${ac}0a`:T.card, border:`1px solid ${isToday?ac+"44":T.border}`, borderRadius:12, padding:"12px 16px", marginBottom:8, cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16, color: isToday?ac:T.text }}>{d.day.toUpperCase()}</span>
                      {isToday && <span style={{ background:`${ac}22`, color:ac, fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:20, fontFamily:"'Barlow Condensed',sans-serif" }}>TODAY</span>}
                      <span style={{ fontSize:12 }}>{d.training?"🏋️":"😴"}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {d.verified > 0 && <span style={{ color:T.green, fontSize:11 }}>✅ {d.verified} verified</span>}
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:15, color: pct===100?T.green:T.mutedHi }}>{d.logged}/{d.total}</span>
                    </div>
                  </div>
                  <div style={{ height:4, background:T.border, borderRadius:99, overflow:"hidden", marginBottom:6 }}>
                    <div style={{ height:"100%", width:`${pct}%`, background: pct===100?T.green:`linear-gradient(90deg,${ac},${T.yellow})`, borderRadius:99, transition:"width 0.4s" }} />
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {getMeals(d.day).map(m => {
                      const ld = logs[getMealKey(d.day, m.id)];
                      return <div key={m.id} style={{ flex:1, height:4, borderRadius:99, background: ld ? (ld.aiResult?.isMatch ? T.green : ld.aiResult ? T.yellow : m.color) : T.border }} />;
                    })}
                  </div>
                </div>
              );
            })}

            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"14px 16px", marginTop:6 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13, color:T.mutedHi, letterSpacing:"0.1em", marginBottom:12 }}>DAILY TARGETS</div>
              {[{l:"Calories",v:"~2,700 kcal",c:T.orange},{l:"Protein",v:"~186g",c:T.green},{l:"Carbs",v:"170–255g",c:T.blue},{l:"Fat",v:"~70g",c:T.yellow},{l:"Weight Gain",v:"~0.5 lb/week",c:T.purple}].map((s,i,arr) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom: i<arr.length-1?`1px solid ${T.border}`:"none" }}>
                  <span style={{ color:T.mutedHi, fontSize:13 }}>{s.l}</span>
                  <span style={{ color:s.c, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14 }}>{s.v}</span>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"12px 14px", marginTop:8 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, color:T.muted, letterSpacing:"0.12em", marginBottom:8 }}>MEAL BAR LEGEND</div>
              {[[T.green,"AI verified — matched your plan"],[T.yellow,"Logged but not matched by AI"],[T.orange,"Logged (no AI result)"],[T.border,"Not yet logged"]].map(([c,l],i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <div style={{ width:24, height:4, borderRadius:99, background:c, flexShrink:0 }} />
                  <span style={{ color:T.mutedHi, fontSize:11 }}>{l}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:T.surface, borderTop:`1px solid ${T.border}`, padding:"10px 0 16px" }}>
        <div style={{ display:"flex", maxWidth:600, width:"100%", margin:"0 auto", justifyContent:"space-around", padding:"0 20px" }}>
          {[["today","📋","TODAY"],["week","📊","WEEK"]].map(([key,icon,label]) => (
            <button key={key} onClick={() => setView(key)} style={{ flex:1, maxWidth:140, background:"none", border:"none", color: view===key?T.orange:T.muted, display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", padding:"4px 0" }}>
              <span style={{ fontSize:20 }}>{icon}</span>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:"0.12em" }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
