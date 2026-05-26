import { useState, useMemo } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const DOW_FULL  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const today = new Date(); today.setHours(0,0,0,0);
function fmtKey(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function parseKey(k){ const [y,m,d]=k.split('-'); return new Date(+y,+m-1,+d); }
function fmtDisplay(k){ return parseKey(k).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }

const CAT = {
  Social:    {bg:"#EDE9FE",text:"#5B21B6",dot:"#7C3AED",emoji:"🤝"},
  Outdoors:  {bg:"#DCFCE7",text:"#166534",dot:"#16A34A",emoji:"🌿"},
  Food:      {bg:"#FEF3C7",text:"#92400E",dot:"#F59E0B",emoji:"🍴"},
  Music:     {bg:"#FCE7F3",text:"#9D174D",dot:"#EC4899",emoji:"🎵"},
  Arts:      {bg:"#E0F2FE",text:"#075985",dot:"#0284C7",emoji:"🎨"},
  Fitness:   {bg:"#DCFCE7",text:"#166534",dot:"#22C55E",emoji:"💪"},
  Volunteer: {bg:"#FEF9C3",text:"#854D0E",dot:"#EAB308",emoji:"🤲"},
  Learning:  {bg:"#E0F2FE",text:"#0C4A6E",dot:"#38BDF8",emoji:"📚"},
  Community: {bg:"#FFF7ED",text:"#9A3412",dot:"#EA580C",emoji:"🏘️"},
};
const fallback = {bg:"#F3F4F6",text:"#374151",dot:"#9CA3AF",emoji:"✨"};

const MEETUP_CAT = {
  "Social":      {bg:"#EDE9FE",text:"#5B21B6",emoji:"🎉"},
  "Outdoors":    {bg:"#DCFCE7",text:"#166534",emoji:"🥾"},
  "Sports":      {bg:"#DBEAFE",text:"#1E40AF",emoji:"⚽"},
  "Arts":        {bg:"#FCE7F3",text:"#9D174D",emoji:"🎨"},
  "Tech":        {bg:"#E0F2FE",text:"#075985",emoji:"💻"},
  "Wellness":    {bg:"#FEF9C3",text:"#854D0E",emoji:"🧘"},
  "Books":       {bg:"#F3E8FF",text:"#6B21A8",emoji:"📖"},
  "Food/Drink":  {bg:"#FFF7ED",text:"#9A3412",emoji:"🍻"},
  "Gaming":      {bg:"#EDE9FE",text:"#4C1D95",emoji:"🎮"},
  "Networking":  {bg:"#DBEAFE",text:"#1E3A8A",emoji:"🤝"},
  "Music":       {bg:"#FCE7F3",text:"#831843",emoji:"🎸"},
  "Volunteering":{bg:"#DCFCE7",text:"#14532D",emoji:"💚"},
};
const mFallback = {bg:"#F3F4F6",text:"#374151",emoji:"👥"};

const AGE_GROUPS = [
  {id:"18-24", label:"18–24", desc:"College & Young Adult"},
  {id:"25-34", label:"25–34", desc:"Young Professional"},
  {id:"35-44", label:"35–44", desc:"Mid-Career & Family"},
  {id:"45-54", label:"45–54", desc:"Established & Active"},
  {id:"55+",   label:"55+",   desc:"Active Seniors"},
];

const c = {
  bg:"#F7F5FF", card:"#FFFFFF", primary:"#6D28D9", primaryLight:"#EDE9FE",
  primaryMid:"#8B5CF6", accent:"#F59E0B", accentLight:"#FEF3C7",
  text:"#1E1B4B", muted:"#6B7280", border:"#E5E7EB", softBorder:"#EDE9FE",
};
const G = {
  header:"linear-gradient(135deg, #4C1D95 0%, #6D28D9 50%, #7C3AED 100%)",
  free:"linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)",
  btn:"linear-gradient(135deg, #6D28D9 0%, #7C3AED 100%)",
  teal:"linear-gradient(135deg, #0F766E 0%, #0D9488 100%)",
};
const sh = {
  card:"0 1px 3px rgba(109,40,217,0.08), 0 4px 16px rgba(109,40,217,0.06)",
  btn:"0 4px 14px rgba(109,40,217,0.35)",
  teal:"0 4px 14px rgba(13,148,136,0.35)",
  sm:"0 1px 4px rgba(0,0,0,0.06)",
};

const GROQ_MODEL = "llama-3.3-70b-versatile";

export default function App() {
  const [tab, setTab] = useState("schedule");
  const [location, setLocation] = useState("");
  const [ageGroup, setAgeGroup] = useState("25-34");
  const [workDays, setWorkDays] = useState(new Set([1,2,3,4,5]));
  const [scheduleMonths, setScheduleMonths] = useState(1);
  const [manualAdded,   setManualAdded]   = useState(new Set());
  const [manualRemoved, setManualRemoved] = useState(new Set());
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [groqKey,   setGroqKey]   = useState("");
  const [showKey,   setShowKey]   = useState(false);
  const [keyStored, setKeyStored] = useState(false);
  const [loadingEvents,  setLoadingEvents]  = useState(false);
  const [loadingMeetups, setLoadingMeetups] = useState(false);
  const [events,      setEvents]      = useState(null);
  const [meetups,     setMeetups]     = useState(null);
  const [error,       setError]       = useState("");
  const [meetupError, setMeetupError] = useState("");

  // ── Groq fetch helper ──────────────────────────────────────────────────────
  const groqFetch = async (prompt) => {
    if(!groqKey.trim()) throw new Error("no-key");
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey.trim()}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await resp.json();
    if(data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const text = data.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if(!match) throw new Error("No JSON returned — try again.");
    return JSON.parse(match[0]);
  };

  // ── Schedule logic ─────────────────────────────────────────────────────────
  const toggleWorkDay = d => {
    setWorkDays(prev=>{const n=new Set(prev);n.has(d)?n.delete(d):n.add(d);return n;});
    setEvents(null);
  };

  const scheduledFreeDays = useMemo(()=>{
    const days=new Set();
    const end=new Date(today); end.setMonth(end.getMonth()+scheduleMonths);
    const cur=new Date(today);
    while(cur<=end){
      if(!workDays.has(cur.getDay())) days.add(fmtKey(cur.getFullYear(),cur.getMonth(),cur.getDate()));
      cur.setDate(cur.getDate()+1);
    }
    return days;
  },[workDays,scheduleMonths]);

  const freeDays = useMemo(()=>{
    const days=new Set();
    if(tab==="schedule"){
      for(const k of scheduledFreeDays) if(!manualRemoved.has(k)) days.add(k);
      for(const k of manualAdded) if(!manualRemoved.has(k)) days.add(k);
    } else {
      for(const k of manualAdded) days.add(k);
    }
    return days;
  },[tab,scheduledFreeDays,manualAdded,manualRemoved]);

  const toggleManualDay = key => {
    const isFree=freeDays.has(key);
    if(tab==="schedule"){
      if(isFree){
        setManualRemoved(p=>{const n=new Set(p);n.add(key);return n;});
        setManualAdded(p=>{const n=new Set(p);n.delete(key);return n;});
      } else {
        setManualAdded(p=>{const n=new Set(p);n.add(key);return n;});
        setManualRemoved(p=>{const n=new Set(p);n.delete(key);return n;});
      }
    } else {
      setManualAdded(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
    }
    setEvents(null);
  };

  const changeMonth = delta=>{
    let m=viewMonth+delta,y=viewYear;
    if(m>11){m=0;y++;} if(m<0){m=11;y--;}
    setViewMonth(m); setViewYear(y);
  };

  const firstDow=new Date(viewYear,viewMonth,1).getDay();
  const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  const sorted=[...freeDays].sort();
  const upcoming=sorted.filter(k=>parseKey(k)>=today).slice(0,14);
  const overrideCount=manualAdded.size+manualRemoved.size;
  const clearOverrides=()=>{setManualAdded(new Set());setManualRemoved(new Set());setEvents(null);};
  const ageLabel=AGE_GROUPS.find(a=>a.id===ageGroup)?.label||ageGroup;
  const keyOk = groqKey.trim().length > 10;

  // ── Search events ──────────────────────────────────────────────────────────
  const doSearch = async () => {
    if(!keyOk){setError("Please enter your Groq API key first.");return;}
    if(!location.trim()){setError("Please enter your city or zip code.");return;}
    if(!upcoming.length){setError("No upcoming free days found.");return;}
    setError(""); setLoadingEvents(true); setEvents(null);
    const dateList=upcoming.map(fmtDisplay).join(", ");
    const prompt=`You are a helpful local events assistant. Find upcoming community events, social activities, and gatherings in or near "${location.trim()}" happening on these dates: ${dateList}.
The person is age ${ageLabel} and wants to meet people and find community. Tailor suggestions to this age group. Look for: local festivals, markets, trivia nights, open mic nights, hiking/outdoor groups, art classes, game nights, fitness classes, book clubs, volunteer events, food/drink events, meetup groups, concerts, farmers markets, community events, classes, workshops.
Return ONLY a valid JSON object, no markdown, no backticks:
{"city":"City name","events":[{"date":"YYYY-MM-DD","name":"Event name","type":"One of: Social,Outdoors,Food,Music,Arts,Fitness,Volunteer,Learning,Community","time":"e.g. 7:00 PM","venue":"Venue or neighborhood","description":"2 sentences about what it is and why it's great for meeting people.","tip":"One quick first-timer tip"}]}
Provide 2-4 events per date. Make them realistic and specific to the area.`;
    try { setEvents(await groqFetch(prompt)); }
    catch(e){ setError(e.message==="no-key"?"Enter your Groq API key above first.":"Couldn't load events. ("+e.message+")"); }
    setLoadingEvents(false);
  };

  // ── Search meetups ─────────────────────────────────────────────────────────
  const doMeetups = async () => {
    if(!keyOk){setMeetupError("Please enter your Groq API key first.");return;}
    if(!location.trim()){setMeetupError("Please enter your city or zip code first.");return;}
    setMeetupError(""); setLoadingMeetups(true); setMeetups(null);
    const ag=AGE_GROUPS.find(a=>a.id===ageGroup);
    const prompt=`You are a local community expert. Find recurring meetup groups and communities in or near "${location.trim()}" specifically welcoming to people aged ${ag?.label||ageGroup} (${ag?.desc||""}).
Look for: Meetup.com groups, Facebook groups, hobby clubs, sports leagues, book clubs, hiking clubs, young professionals groups, trivia leagues, art classes, fitness groups, cooking clubs, board game nights, volunteer organizations, alumni networks, activity-based social groups.
Return ONLY a valid JSON object, no markdown, no backticks:
{"city":"City name","meetups":[{"name":"Group/meetup name","category":"One of: Social,Outdoors,Sports,Arts,Tech,Wellness,Books,Food/Drink,Gaming,Networking,Music,Volunteering","frequency":"How often they meet e.g. Every Thursday","size":"Approx group size e.g. 50-200 members","description":"2 sentences: what the group does and why it is great for the ${ag?.label} age group.","where":"Platform or venue e.g. Meetup.com, local park, brewery","vibe":"One phrase e.g. Casual and welcoming"}]}
Provide 6-9 diverse groups across different interests. Be specific to the city and age group.`;
    try { setMeetups(await groqFetch(prompt)); }
    catch(e){ setMeetupError(e.message==="no-key"?"Enter your Groq API key above first.":"Couldn't load meetups. ("+e.message+")"); }
    setLoadingMeetups(false);
  };

  const eventsByDate={};
  if(events?.events){
    for(const k of upcoming) eventsByDate[k]=[];
    for(const ev of events.events){
      if(eventsByDate[ev.date]) eventsByDate[ev.date].push(ev);
      else if(upcoming.length) eventsByDate[upcoming[0]].push(ev);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{background:c.bg,minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:60}}>

      {/* ── Hero ── */}
      <div style={{background:G.header,padding:"2.25rem 1.5rem 3.75rem",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-50,right:-50,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.07)"}}/>
        <div style={{position:"absolute",bottom:-70,left:-30,width:240,height:240,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <div style={{position:"absolute",top:"30%",right:"20%",width:80,height:80,borderRadius:"50%",background:"rgba(251,191,36,0.15)"}}/>
        <div style={{position:"relative",zIndex:1,maxWidth:580,margin:"0 auto"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
              🌅
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:2}}>
              <span style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:"-1px",fontFamily:"Georgia,serif"}}>Free</span>
              <span style={{fontSize:26,fontWeight:900,background:"linear-gradient(90deg,#FDE68A,#FCD34D)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"-1px",fontFamily:"Georgia,serif"}}>Glow</span>
            </div>
          </div>
          <p style={{fontSize:15,color:"rgba(255,255,255,0.78)",margin:0,lineHeight:1.5,maxWidth:340}}>
            Your days off deserve to shine ✨ — find events & meetups that fit your life
          </p>
        </div>
      </div>

      <div style={{maxWidth:580,margin:"-2rem auto 0",padding:"0 1rem",position:"relative",zIndex:2}}>

        {/* ── Groq API Key ── */}
        <div style={{background:c.card,borderRadius:18,padding:"1.25rem",boxShadow:sh.card,marginBottom:14,border:keyOk?`1.5px solid #6EE7B7`:`1.5px solid ${c.softBorder}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <label style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:c.muted,textTransform:"uppercase"}}>
              🔑 Groq API Key
            </label>
            {keyOk && <span style={{fontSize:11,fontWeight:700,color:"#059669",background:"#D1FAE5",padding:"2px 10px",borderRadius:20}}>✓ Key saved</span>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input
              type={showKey?"text":"password"}
              value={groqKey}
              onChange={e=>setGroqKey(e.target.value)}
              placeholder="gsk_..."
              style={{flex:1,padding:"11px 14px",fontSize:14,border:`2px solid ${keyOk?"#6EE7B7":c.softBorder}`,borderRadius:12,outline:"none",color:c.text,background:"#FAFAFA",fontFamily:"monospace",boxSizing:"border-box",transition:"border-color 0.2s"}}
              onFocus={e=>e.target.style.borderColor=c.primaryMid}
              onBlur={e=>e.target.style.borderColor=keyOk?"#6EE7B7":c.softBorder}
            />
            <button onClick={()=>setShowKey(s=>!s)}
              style={{padding:"11px 14px",borderRadius:12,border:`2px solid ${c.border}`,background:"#fff",cursor:"pointer",fontSize:13,color:c.muted,fontWeight:600,whiteSpace:"nowrap"}}>
              {showKey?"Hide":"Show"}
            </button>
          </div>
          <p style={{fontSize:11,color:c.muted,marginTop:7,marginBottom:0,lineHeight:1.5}}>
            Get a free key at <span style={{color:c.primary,fontWeight:600}}>console.groq.com</span> · Powered by Llama 3.3 70B · Your key stays in this browser only
          </p>
        </div>

        {/* ── Location + Age ── */}
        <div style={{background:c.card,borderRadius:18,padding:"1.25rem",boxShadow:sh.card,marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:c.muted,textTransform:"uppercase",marginBottom:8}}>📍 Your Location</label>
          <input value={location} onChange={e=>setLocation(e.target.value)}
            placeholder="City, state or zip — e.g. Atlanta, GA"
            style={{width:"100%",padding:"11px 15px",fontSize:15,border:`2px solid ${c.softBorder}`,borderRadius:12,outline:"none",color:c.text,background:"#FAFAFA",boxSizing:"border-box",transition:"border-color 0.2s",marginBottom:16}}
            onFocus={e=>e.target.style.borderColor=c.primaryMid}
            onBlur={e=>e.target.style.borderColor=c.softBorder}
          />
          <div style={{borderTop:`1px solid ${c.border}`,paddingTop:14}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:c.muted,textTransform:"uppercase",marginBottom:10}}>🎂 Your Age Group</label>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {AGE_GROUPS.map(ag=>{
                const sel=ageGroup===ag.id;
                return (
                  <button key={ag.id} onClick={()=>{setAgeGroup(ag.id);setMeetups(null);}}
                    style={{padding:"8px 14px",borderRadius:22,fontSize:13,fontWeight:700,border:"2px solid",cursor:"pointer",
                      background:sel?G.btn:"#fff",color:sel?"#fff":c.muted,
                      borderColor:sel?c.primary:c.border,boxShadow:sel?sh.btn:sh.sm,transition:"all 0.2s",lineHeight:1.2}}>
                    <div>{ag.label}</div>
                    <div style={{fontSize:10,fontWeight:500,opacity:sel?0.8:0.7,marginTop:1}}>{ag.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div style={{background:"rgba(255,255,255,0.7)",borderRadius:14,padding:5,marginBottom:14,display:"flex",gap:4}}>
          {[["schedule","📋  Work Schedule"],["manual","✏️  Pick Days Manually"]].map(([id,label])=>(
            <button key={id} onClick={()=>{setTab(id);setEvents(null);}}
              style={{flex:1,padding:"10px 0",fontSize:13,fontWeight:700,border:"none",borderRadius:10,cursor:"pointer",
                background:tab===id?G.btn:"transparent",color:tab===id?"#fff":c.muted,
                boxShadow:tab===id?sh.btn:"none",transition:"all 0.2s"}}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Schedule settings ── */}
        {tab==="schedule" && (
          <div style={{background:c.card,borderRadius:18,padding:"1.25rem",boxShadow:sh.card,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:c.muted,textTransform:"uppercase",marginBottom:12}}>Which days do you work?</div>
            <div style={{display:"flex",gap:7,marginBottom:"1.1rem",flexWrap:"wrap"}}>
              {DOW_FULL.map((name,i)=>{
                const isWork=workDays.has(i);
                return (
                  <button key={i} onClick={()=>toggleWorkDay(i)}
                    style={{width:44,height:44,borderRadius:"50%",fontSize:13,fontWeight:700,border:"2px solid",cursor:"pointer",
                      background:isWork?G.btn:c.card,color:isWork?"#fff":c.muted,
                      borderColor:isWork?c.primary:c.border,boxShadow:isWork?sh.btn:sh.sm,transition:"all 0.2s"}}>
                    {DOW_SHORT[i]}
                  </button>
                );
              })}
            </div>
            <div style={{borderTop:`1px solid ${c.border}`,paddingTop:12}}>
              <div style={{fontSize:11,fontWeight:700,color:c.muted,marginBottom:8,letterSpacing:"0.05em",textTransform:"uppercase"}}>Look Ahead</div>
              <div style={{display:"flex",gap:7}}>
                {[1,2,3].map(n=>(
                  <button key={n} onClick={()=>{setScheduleMonths(n);setEvents(null);}}
                    style={{flex:1,padding:"8px 0",fontSize:13,fontWeight:700,borderRadius:10,cursor:"pointer",border:"2px solid",
                      background:scheduleMonths===n?c.primaryLight:"#fff",color:scheduleMonths===n?c.primary:c.muted,
                      borderColor:scheduleMonths===n?c.primary:c.border,transition:"all 0.2s"}}>
                    {n} month{n>1?"s":""}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${c.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:13,color:c.muted}}><span style={{fontWeight:700,color:c.text}}>{upcoming.length}</span> free days coming up</span>
              {overrideCount>0 && <button onClick={clearOverrides} style={{fontSize:12,color:c.primary,fontWeight:700,background:"none",border:"none",cursor:"pointer",padding:0}}>Clear {overrideCount} override{overrideCount>1?"s":""}</button>}
            </div>
          </div>
        )}

        {/* ── Calendar ── */}
        <div style={{background:c.card,borderRadius:18,padding:"1.25rem",boxShadow:sh.card,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontSize:16,fontWeight:800,color:c.text}}>{MONTHS[viewMonth]} {viewYear}</span>
            <div style={{display:"flex",gap:6}}>
              {[["‹",-1],["›",1]].map(([ch,d])=>(
                <button key={ch} onClick={()=>changeMonth(d)}
                  style={{width:32,height:32,borderRadius:10,border:`1.5px solid ${c.border}`,background:"#fff",cursor:"pointer",fontSize:16,color:c.muted,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {DOW_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#C4B5FD",padding:"4px 0",letterSpacing:"0.05em"}}>{d}</div>)}
            {Array(firstDow).fill(null).map((_,i)=><div key={"e"+i}/>)}
            {Array(daysInMonth).fill(null).map((_,i)=>{
              const d=i+1,dt=new Date(viewYear,viewMonth,d),key=fmtKey(viewYear,viewMonth,d);
              const isPast=dt<today,isTod=dt.getTime()===today.getTime(),isFree=freeDays.has(key);
              const isOA=manualAdded.has(key),isOR=manualRemoved.has(key);
              let bg="transparent",color=isPast?"#D1D5DB":c.text,border="none";
              if(isFree){bg=isOA?"#D1FAE5":G.free;color=isOA?"#065F46":c.primary;border=`1.5px solid ${isOA?"#6EE7B7":"#C4B5FD"}`;}
              else if(isOR){border="1.5px dashed #FCA5A5";color="#EF4444";}
              if(isTod&&!isFree) border=`2px solid ${c.primaryMid}`;
              return (
                <div key={d} onClick={!isPast?()=>toggleManualDay(key):undefined}
                  style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,
                    fontSize:13,cursor:isPast?"default":"pointer",fontWeight:isFree||isTod?700:400,
                    background:bg,color,border,position:"relative",transition:"all 0.15s",
                    boxShadow:isFree?"0 2px 8px rgba(109,40,217,0.12)":"none"}}>
                  {d}
                  {isTod&&<span style={{position:"absolute",bottom:3,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:isFree?"#fff":c.primary}}/>}
                </div>
              );
            })}
          </div>
          {tab==="schedule" && <p style={{fontSize:12,color:"#A78BFA",marginTop:12,textAlign:"center",fontStyle:"italic"}}>Tap any day to override your schedule</p>}
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:14,paddingLeft:4}}>
          {[{color:"#C4B5FD",label:"Free day"},...(tab==="schedule"?[{color:"#6EE7B7",label:"Added as free"},{color:"#FCA5A5",label:"Marked working",dashed:true}]:[])].map(({color,label,dashed})=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:c.muted}}>
              <span style={{width:12,height:12,borderRadius:3,background:dashed?"transparent":"#EDE9FE",border:`1.5px ${dashed?"dashed":"solid"} ${color}`,display:"inline-block"}}/>
              {label}
            </div>
          ))}
        </div>

        {/* Chips */}
        {upcoming.length>0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
            {upcoming.slice(0,10).map(k=>(
              <span key={k} style={{display:"inline-flex",alignItems:"center",gap:5,background:c.primaryLight,color:c.primary,fontSize:12,fontWeight:600,padding:"5px 12px",borderRadius:20,border:"1px solid #C4B5FD"}}>
                {fmtDisplay(k)}
                <span onClick={()=>toggleManualDay(k)} style={{cursor:"pointer",fontSize:15,opacity:0.5,lineHeight:1}}>×</span>
              </span>
            ))}
            {upcoming.length>10 && <span style={{fontSize:12,color:c.muted,alignSelf:"center",fontStyle:"italic"}}>+{upcoming.length-10} more</span>}
          </div>
        )}

        {error && <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:12,padding:"12px 16px",fontSize:13,color:"#991B1B",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}><span>⚠️</span>{error}</div>}

        {/* Action buttons */}
        <button onClick={doSearch} disabled={loadingEvents||!keyOk}
          style={{width:"100%",padding:"15px",fontSize:15,fontWeight:800,
            background:loadingEvents||!keyOk?"#C4B5FD":G.btn,color:"#fff",
            border:"none",borderRadius:14,cursor:loadingEvents||!keyOk?"default":"pointer",
            marginBottom:10,letterSpacing:"0.02em",
            boxShadow:loadingEvents||!keyOk?"none":sh.btn,transition:"all 0.2s"}}>
          {loadingEvents?"🔍  Searching for events nearby…":`✨  Find events on my ${upcoming.length} free day${upcoming.length===1?"":"s"}`}
        </button>

        <button onClick={doMeetups} disabled={loadingMeetups||!keyOk}
          style={{width:"100%",padding:"15px",fontSize:15,fontWeight:800,
            background:loadingMeetups||!keyOk?"#99F6E4":G.teal,color:"#fff",
            border:"none",borderRadius:14,cursor:loadingMeetups||!keyOk?"default":"pointer",
            marginBottom:"1.5rem",letterSpacing:"0.02em",
            boxShadow:loadingMeetups||!keyOk?"none":sh.teal,transition:"all 0.2s"}}>
          {loadingMeetups?"🔍  Finding meetup groups…":`👥  Find ${ageLabel} Meetup Groups Near Me`}
        </button>

        {loadingEvents && (
          <div style={{textAlign:"center",padding:"2rem",color:c.muted,fontSize:14}}>
            <div style={{fontSize:36,marginBottom:10}}>🗺️</div>
            <div style={{fontWeight:600,color:c.text,marginBottom:4}}>Finding things to do in {location}…</div>
            <div style={{fontSize:13}}>Powered by Groq · Llama 3.3 70B</div>
          </div>
        )}

        {loadingMeetups && (
          <div style={{textAlign:"center",padding:"2rem",color:c.muted,fontSize:14}}>
            <div style={{fontSize:36,marginBottom:10}}>👥</div>
            <div style={{fontWeight:600,color:c.text,marginBottom:4}}>Finding {ageLabel} meetup groups in {location}…</div>
            <div style={{fontSize:13}}>Powered by Groq · Llama 3.3 70B</div>
          </div>
        )}

        {/* ── Meetup results ── */}
        {meetups && !loadingMeetups && (
          <div style={{marginBottom:"2rem"}}>
            <div style={{background:G.teal,borderRadius:16,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:28}}>👥</div>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>Meetup Groups for Ages {ageLabel}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",marginTop:2}}>Near {meetups.city||location} · Recurring communities to join</div>
              </div>
            </div>
            {meetupError && <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:12,padding:"12px 16px",fontSize:13,color:"#991B1B",marginBottom:12}}>⚠️ {meetupError}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {(meetups.meetups||[]).map((m,i)=>{
                const col=MEETUP_CAT[m.category]||mFallback;
                return (
                  <div key={i} style={{background:c.card,borderRadius:16,padding:"14px",boxShadow:sh.card,border:`1px solid ${c.border}`,display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{width:38,height:38,borderRadius:10,background:col.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{col.emoji}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:800,color:c.text,lineHeight:1.3,marginBottom:2}}>{m.name}</div>
                        <span style={{display:"inline-block",fontSize:10,padding:"2px 8px",borderRadius:10,background:col.bg,color:col.text,fontWeight:700}}>{m.category}</span>
                      </div>
                    </div>
                    <div style={{fontSize:12,color:"#374151",lineHeight:1.55}}>{m.description}</div>
                    <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:4}}>
                      <div style={{fontSize:11,color:c.muted,display:"flex",alignItems:"center",gap:5}}><span>🔄</span><span style={{fontWeight:600}}>{m.frequency}</span></div>
                      <div style={{fontSize:11,color:c.muted,display:"flex",alignItems:"center",gap:5}}><span>👤</span><span>{m.size}</span></div>
                      <div style={{fontSize:11,color:c.muted,display:"flex",alignItems:"center",gap:5}}><span>📍</span><span>{m.where}</span></div>
                      {m.vibe && <div style={{background:c.primaryLight,borderRadius:8,padding:"4px 8px",fontSize:11,color:c.primary,fontWeight:600,marginTop:2}}>✨ {m.vibe}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Events results ── */}
        {events && !loadingEvents && (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{flex:1,height:1,background:c.softBorder}}/>
              <span style={{fontSize:12,fontWeight:700,color:c.primary,letterSpacing:"0.08em",textTransform:"uppercase"}}>Events near {events.city||location}</span>
              <div style={{flex:1,height:1,background:c.softBorder}}/>
            </div>
            {upcoming.map(k=>{
              const evs=eventsByDate[k]||[];
              if(!evs.length) return null;
              return (
                <div key={k} style={{marginBottom:"1.75rem"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{background:G.btn,borderRadius:10,padding:"4px 12px"}}>
                      <span style={{fontSize:12,fontWeight:800,color:"#fff",letterSpacing:"0.04em"}}>{fmtDisplay(k)}</span>
                    </div>
                    <div style={{flex:1,height:1,background:c.border}}/>
                  </div>
                  {evs.map((ev,i)=>{
                    const col=CAT[ev.type]||fallback;
                    return (
                      <div key={i} style={{background:c.card,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:sh.card,border:`1px solid ${c.border}`,display:"flex",gap:13,alignItems:"flex-start"}}>
                        <div style={{width:40,height:40,borderRadius:12,background:col.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>{col.emoji}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:15,fontWeight:800,color:c.text,marginBottom:3,lineHeight:1.3}}>{ev.name}</div>
                          <div style={{fontSize:12,color:c.muted,marginBottom:7,display:"flex",flexWrap:"wrap",gap:8}}><span>🕐 {ev.time}</span><span>📍 {ev.venue}</span></div>
                          <div style={{fontSize:13,color:"#374151",lineHeight:1.6,marginBottom:8}}>{ev.description}</div>
                          {ev.tip && <div style={{background:c.accentLight,borderRadius:8,padding:"7px 10px",fontSize:12,color:"#78350F",marginBottom:8,lineHeight:1.5}}>💡 <span style={{fontWeight:600}}>Tip:</span> {ev.tip}</div>}
                          <span style={{display:"inline-block",fontSize:11,padding:"3px 10px",borderRadius:12,background:col.bg,color:col.text,fontWeight:700,letterSpacing:"0.04em"}}>{ev.type}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div style={{textAlign:"center",padding:"1rem 1rem 0"}}>
              <span style={{background:c.primaryLight,color:c.primary,padding:"6px 16px",borderRadius:20,fontWeight:600,fontSize:12}}>
                🌅 FreeGlow · {upcoming.length} free day{upcoming.length!==1?"s":""} · {events.city||location}
              </span>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} *{box-sizing:border-box;}`}</style>
    </div>
  );
}
