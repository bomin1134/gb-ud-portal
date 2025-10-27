// src/App.jsx — v0.6 (관리자 탭 + 공지사항 + 속도개선)
import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/*
  변경점 (v0.6)
  1) 관리자 화면 탭 추가: [지회 보고 현황] / [주차별 제출현황] / [공지사항]
  2) 공지사항(관리자만 작성, 지회 열람) 기능 추가 (notices 테이블 필요)
  3) 속도 개선: 다건 조회를 단일 쿼리(in)로 묶고, 클라이언트 매핑
  4) files 컬럼(text/jsonb/text[]) 호환 저장/읽기 그대로 유지
*/

// ----------------------------- 기본 데이터 -----------------------------
const RAW_BRANCHES = [
  "포항시","경주시","김천시","안동시","구미시","영주시","영천시","상주시","문경시","경산시",
  "청송군","영양군","영덕군","청도군","고령군","성주군","칠곡군","예천군","봉화군","울진군"
];
const BRANCHES = RAW_BRANCHES.map((n,i)=>({ id: i+1, name: `한국교통장애인협회 ${n}지회` }));

const USERS = [
  { id:"gbudc", pw:"gbudc", role:"admin" },
  ...Array.from({length:20}).map((_,i)=>({
    id:`gb${String(i+1).padStart(3,"0")}`,
    pw:`gb${String(i+1).padStart(3,"0")}`,
    role:"branch",
    branchId:i+1
  }))
];

const STATUS = {
  NONE:     { key:"NONE",     label:"미제출",     color:"bg-neutral-300 text-neutral-900" },
  REPORT:   { key:"REPORT",   label:"보고서 제출", color:"bg-emerald-600/90 text-white" },
  OFFICIAL: { key:"OFFICIAL", label:"사유서 제출",   color:"bg-orange-500/90 text-white" }
};

// ----------------------------- Week 유틸 -----------------------------
function startOfWeekMonday(d){ const x=new Date(d); const n=x.getDay(); const diff=(n===0?-6:1-n); x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function koreanOrdinal(n){ return ["첫째","둘째","셋째","넷째","다섯째"][n-1]||`${n}째`; }
function ymdLocal(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
function weekLabelKorean(monday){ const y=monday.getFullYear(); const mIdx=monday.getMonth(); const firstDay = new Date(y, mIdx, 1); const toMon = (8-firstDay.getDay())%7; const firstMon = new Date(y, mIdx, 1+toMon); const diffDays=Math.floor((monday-firstMon)/(1000*60*60*24)); const ordinal = diffDays<0?1:Math.floor(diffDays/7)+1; const m=mIdx+1; return `${y} ${m}월 ${koreanOrdinal(ordinal)}주`; }
function makeWeeks(c=12){ const w=[]; let cur=startOfWeekMonday(new Date()); for(let i=0;i<c;i++){ const s=new Date(cur); const e=addDays(s,6); w.push({ id: ymdLocal(s), label: weekLabelKorean(s), start:s, end:e }); cur=addDays(cur,-7);} return w; }
const WEEKS = makeWeeks(12);

// ----------------------------- helpers -----------------------------
function fileNameFromPath(p){ if(!p) return "파일"; const parts=String(p).split("/"); return parts[parts.length-1]||String(p); }
function uniq(arr){ return Array.from(new Set(arr)); }

// files 호환 파서/직렬화
function normalizeFilesField(raw){
  if(!raw) return [];
  if(Array.isArray(raw)){
    if(raw.every(v=>typeof v==='string')) return raw.map(p=>({name:fileNameFromPath(p), path:p}));
    return raw.map(o=>({ name:o?.name ?? (o?.path?fileNameFromPath(o.path):'파일'), path:o?.path ?? (typeof o==='string'?o:null), url:o?.url ?? null }));
  }
  if(typeof raw==='string'){
    const s=raw.trim();
    if((s.startsWith('[')&&s.endsWith(']'))||(s.startsWith('{')&&s.endsWith('}'))){ try{ return normalizeFilesField(JSON.parse(s)); }catch{ /* ignore */ } }
    if(s.includes('\n')||s.includes('|')){ return s.split(/\n|\|/).map(v=>v.trim()).filter(Boolean).map(p=>({name:fileNameFromPath(p), path:p})); }
    return [{name:fileNameFromPath(s), path:s}];
  }
  return [];
}
function serializeFilesForDB(files){
  const arr=(files||[]).map(f=> typeof f==='string'? {name:fileNameFromPath(f), path:f} : {name:f?.name ?? (f?.path?fileNameFromPath(f.path):'파일'), path:f?.path ?? null});
  return JSON.stringify(arr);
}

// ----------------------------- 공용 컴포넌트 -----------------------------
function Btn({children,onClick,variant="neutral",className="",type="button"}){ const base="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"; const style=variant==="primary"?"bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm":variant==="soft"?"bg-neutral-100 text-neutral-800 hover:bg-neutral-200 border border-neutral-200":variant==="danger"?"bg-red-600 text-white hover:bg-red-700 shadow-sm":"bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-50"; return <button type={type} onClick={onClick} className={`${base} ${style} ${className}`}>{children}</button>; }
function Field({label,children,help}){ return (<div className="space-y-2">{label&&<label className="text-sm font-semibold text-neutral-800">{label}</label>}{children}{help&&<p className="text-xs text-neutral-500">{help}</p>}</div>); }
function Input(props){ return <input {...props} className={`w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent ${props.className||""}`} />; }
function Textarea(props){ return <textarea {...props} className={`w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent ${props.className||""}`} />; }
function Select(props){ return <select {...props} className={`w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent ${props.className||""}`} />; }
function Card({title,actions,children}){ return (<div className="rounded-2xl border border-neutral-200 bg-white shadow-sm"><div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200"><h2 className="text-lg font-bold text-neutral-900">{title}</h2><div className="flex items-center gap-2">{actions}</div></div><div className="p-5">{children}</div></div>); }
function StatusChip({statusKey}){ const s=STATUS[statusKey]||STATUS.NONE; return <span className={`inline-flex items-center gap-1 ${s.color} rounded-full px-3 py-1 text-xs shadow-sm`}>● {s.label}</span>; }
function Tabs({tabs,active,onChange}){ return (<div className="flex items-center gap-2 border-b pb-2 mb-4">{tabs.map(t=> <button key={t.key} onClick={()=>onChange(t.key)} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${active===t.key? 'bg-neutral-900 text-white':'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>{t.label}</button>)}</div>); }

// 중앙 로딩 모달
function LoadingModal({text="로딩 중…"}){
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center h-screen w-screen">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative z-10 bg-white rounded-2xl shadow-lg px-6 py-5 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin" />
        <div className="text-neutral-700 font-medium">{text}</div>
      </div>
    </div>
  );
}

// 파일 미리보기/다운로드 헬퍼를 포함한 작은 미리보기 모달
function PreviewModal({open, onClose, item}){
  if(!open || !item) return null;
  const handleClose = ()=>{
    try{ if(item?.url && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url); }catch(e){}
    onClose && onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative z-10 bg-white rounded-xl shadow-xl max-w-[90vw] max-h-[90vh] overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{item.name}</div>
          <div className="flex items-center gap-2">
            <button className="text-sm text-neutral-700" onClick={()=>{ if(item?.url && item.url.startsWith('blob:')){ const a=document.createElement('a'); a.href=item.url; a.download=item.name; document.body.appendChild(a); a.click(); a.remove(); } }}>다운로드</button>
            <button className="text-sm text-neutral-500" onClick={handleClose}>닫기</button>
          </div>
        </div>
        <div className="max-w-[80vw] max-h-[70vh]">
          {item.type==='image' && <img src={item.url} alt={item.name} className="max-w-full max-h-[70vh] object-contain" />}
          {item.type==='pdf' && <iframe title={item.name} src={item.url} className="w-[80vw] h-[70vh] border" />}
          {!item.type && (<div className="text-sm text-neutral-600">미리보기가 지원되지 않는 파일입니다.</div>)}
        </div>
      </div>
    </div>
  );
}

// ----------------------------- Store (Supabase or Memory) -----------------------------
function useStore(){
  const url   = import.meta.env.VITE_SUPABASE_URL;
  const key   = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const bucket= import.meta.env.VITE_SUPABASE_BUCKET || "reports";
  const table = import.meta.env.VITE_SUPABASE_TABLE  || "submissions";
  const noticeTable = import.meta.env.VITE_SUPABASE_NOTICE_TABLE || "notices";

  if(url && key){
    const client=createClient(url,key);
    return {
      storeType:"supabase",
      // 단건 조회
      async getRecord(branchId,weekId){
        const { data } = await client.from(table).select("*").eq("id",`${branchId}_${weekId}`).maybeSingle();
        if(!data) return { title:"", status:"NONE", note:"", files:[], submittedAt:null };
        return { title:data.title||"", status:data.status||"NONE", note:data.note||"", files:normalizeFilesField(data.files), submittedAt:data.submitted_at||null };
      },
      // 다건 조회(속도개선): 한 번에 가져와서 매핑
      async getRecordsForBranchWeeks(branchId, weekIds){
        const { data, error } = await client
          .from(table)
          .select("week_id,status,title,submitted_at,files")
          .eq("branch_id", branchId)
          .in("week_id", weekIds);
        if(error){ console.error(error); return new Map(); }
        const map = new Map();
        for(const r of (data||[])){
          map.set(r.week_id, { title:r.title||"", status:r.status||"NONE", note:"", files:normalizeFilesField(r.files), submittedAt:r.submitted_at||null });
        }
        return map;
      },
      // 관리자 요약용: 여러 지회 x 특정 주차들 (최근 4주 등)
      async getStatusesMatrix(branchIds, weekIds){
        const { data, error } = await client
          .from(table)
          .select("branch_id,week_id,status")
          .in("branch_id", branchIds)
          .in("week_id", weekIds);
        if(error){ console.error(error); return []; }
        return data||[]; // [{branch_id, week_id, status}]
      },
      async setRecord(branchId,weekId,rec){
        const filesField = serializeFilesForDB(rec.files);
        const payload = { id:`${branchId}_${weekId}`, branch_id:branchId, week_id:weekId, title:rec.title??"", status:rec.status, note:rec.note, files:filesField, submitted_at:rec.submittedAt };
        const { error } = await client.from(table).upsert(payload);
        if(error){ console.error("DB upsert error", error, payload); throw new Error("DB 저장 실패: "+(error.message||JSON.stringify(error))); }
      },
      async uploadFiles(branchId,weekId,files){
        const metas=[];
        for(const f of (files||[])){
          const orig=f.name||"file";
          const dot=orig.lastIndexOf(".");
          const ext= dot>-1 ? orig.slice(dot).replace(/[^A-Za-z0-9.]/g,"").toLowerCase() : "";
          const safe = crypto?.randomUUID ? crypto.randomUUID()+ext : (Math.random().toString(36).slice(2)+Date.now().toString(36))+ext;
          const path=`gb${String(branchId).padStart(3,"0")}/${weekId}/${safe}`;
          const { error } = await client.storage.from(bucket).upload(path, f, { upsert:true, contentType:f.type||undefined });
          if(error){ console.error("storage.upload error", error); alert("Storage 업로드 실패: "+(error?.message||JSON.stringify(error))); }
          else { metas.push({ name:orig, path }); }
        }
        return metas;
      },
      async getFileUrl(path){ const { data } = await client.storage.from(bucket).createSignedUrl(path, 60*60); return data?.signedUrl||null; },
      async deleteWeek(branchId,weekId){
        const prefix=`gb${String(branchId).padStart(3,"0")}/${weekId}`;
        const { data:list } = await client.storage.from(bucket).list(prefix);
        if(list?.length){ await client.storage.from(bucket).remove(list.map(f=>`${prefix}/${f.name}`)); }
        await client.from(table).upsert({ id:`${branchId}_${weekId}`, branch_id:branchId, week_id:weekId, title:"", status:"NONE", note:"", files:serializeFilesForDB([]), submitted_at:null });
      },
      // --- 공지사항 ---
      async listNotices(limit=20){
        const { data, error } = await client.from(noticeTable).select("id,title,body,author,created_at").order("created_at", { ascending:false }).limit(limit);
        if(error){ console.error(error); return []; }
        return data||[];
      },
      async createNotice(title, body, author){
        const { error } = await client.from(noticeTable).insert({ title, body, author });
        if(error){ console.error(error); throw new Error(error.message||"공지 저장 실패"); }
      }
    };
  }

  // 데모 스토어 (간단)
  const [map,setMap]=useState(new Map());
  const [notices,setNotices]=useState([]);
  return {
    storeType:"demo",
    async getRecord(b,w){ return map.get(`${b}_${w}`)||{title:"",status:"NONE",note:"",files:[],submittedAt:null}; },
    async getRecordsForBranchWeeks(b,weekIds){ const m=new Map(); for(const wk of weekIds){ const r=map.get(`${b}_${wk}`); if(r) m.set(wk,r);} return m; },
    async getStatusesMatrix(branchIds,weekIds){ const rows=[]; for(const bid of branchIds){ for(const wk of weekIds){ const r=map.get(`${bid}_${wk}`); if(r) rows.push({branch_id:bid, week_id:wk, status:r.status}); }} return rows; },
    async setRecord(b,w,r){ setMap(p=>{ const n=new Map(p); const prev=n.get(`${b}_${w}`)||{}; n.set(`${b}_${w}`, {...prev,...r}); return n; }); },
    async uploadFiles(b,w,files){ return Array.from(files||[]).map(f=>({name:f.name, path:`demo://${f.name}`})); },
    async getFileUrl(p){ return p; },
    async deleteWeek(b,w){ setMap(p=>{ const n=new Map(p); n.set(`${b}_${w}`, {title:"",status:"NONE",note:"",files:[],submittedAt:null}); return n;}); },
    async listNotices(){ return notices; },
    async createNotice(title,body,author){ setNotices(p=>[{id:Date.now(), title, body, author, created_at:new Date().toISOString()}, ...p]); }
  };
}

// ----------------------------- 로그인 -----------------------------
function Login({onLogin}){
  const [id,setId]=useState(""); const [pw,setPw]=useState(""); const [err,setErr]=useState("");
  const submit=(e)=>{ e.preventDefault(); const u=USERS.find(v=>v.id===id&&v.pw===pw); if(!u){ setErr("아이디 또는 비밀번호가 올바르지 않습니다."); return;} onLogin(u); };
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-neutral-900">GB-UD 지회 보고포털 로그인</h1>
        <Field label="아이디"><Input value={id} onChange={e=>setId(e.target.value)} /></Field>
        <Field label="비밀번호"><Input type="password" value={pw} onChange={e=>setPw(e.target.value)} /></Field>
        {err&&<div className="text-red-600 text-sm">{err}</div>}
        <Btn type="submit" variant="primary" className="w-full">로그인</Btn>
      </form>
    </div>
  );
}

// ----------------------------- 공지사항 -----------------------------
function NoticeBoard({store,isAdmin}){
  const [items,setItems]=useState([]);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");

  const load=async()=>{ const list=await store.listNotices(50); setItems(list); };
  useEffect(()=>{ load(); },[store]);

  const submit=async()=>{
    if(!title.trim()||!body.trim()) return alert('제목/내용을 입력하세요');
    try{ await store.createNotice(title.trim(), body.trim(), 'admin'); setTitle(""); setBody(""); await load(); }
    catch(e){ alert(e.message||'공지 저장 실패'); }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card title="공지 작성">
          <div className="space-y-3">
            <Field label="제목"><Input value={title} onChange={e=>setTitle(e.target.value)} /></Field>
            <Field label="내용"><Textarea rows={4} value={body} onChange={e=>setBody(e.target.value)} /></Field>
            <Btn variant="primary" onClick={submit}>등록</Btn>
          </div>
        </Card>
      )}

      <Card title="공지 목록">
        <ul className="divide-y divide-neutral-200">
          {(items||[]).map(n=> (
            <li key={n.id} className="py-3">
              <div className="font-semibold text-neutral-900">{n.title}</div>
              <div className="text-sm text-neutral-500">{new Date(n.created_at).toLocaleString()} · {n.author||'관리자'}</div>
              <div className="mt-2 whitespace-pre-wrap leading-relaxed">{n.body}</div>
            </li>
          ))}
          {(!items||items.length===0)&&<li className="py-6 text-neutral-500">등록된 공지가 없습니다.</li>}
        </ul>
      </Card>
    </div>
  );
}

// ----------------------------- 관리자 대시보드 -----------------------------
function AdminDashboard({store,onOpenBranch}){
  const [tab,setTab]=useState('overview'); // overview | weekly | notice

  // overview: 최근 4주 상태칩 요약(기존 카드)
  const [recentMap,setRecentMap]=useState({});
  const [loadingOverview,setLoadingOverview]=useState(true);
  useEffect(()=>{(async()=>{
    setLoadingOverview(true);
    const weekIds=WEEKS.slice(0,4).map(w=>w.id);
    const branchIds=BRANCHES.map(b=>b.id);
    const rows=await store.getStatusesMatrix(branchIds, weekIds); // [{branch_id,week_id,status}]
    const grouped={};
    for(const b of BRANCHES){ grouped[b.id]=weekIds.map(()=>"NONE"); }
    for(const r of rows){ const wi=weekIds.indexOf(r.week_id); if(wi>-1){ grouped[r.branch_id][wi]=r.status||"NONE"; } }
    setRecentMap(grouped); setLoadingOverview(false);
  })();},[store]);

  // weekly: 특정 주차 선택 → 지회별 상태 리스트
  const [selectedWeek,setSelectedWeek]=useState(WEEKS[0].id);
  const [weeklyRows,setWeeklyRows]=useState([]);
  const [loadingWeekly,setLoadingWeekly]=useState(false);
  useEffect(()=>{(async()=>{
    setLoadingWeekly(true);
    const branchIds=BRANCHES.map(b=>b.id);
    const rows=await store.getStatusesMatrix(branchIds, [selectedWeek]);
    const map=new Map(rows.map(r=>[r.branch_id, r.status||"NONE"]));
    const list=BRANCHES.map(b=>({ branch:b, status: map.get(b.id)||"NONE" }));
    setWeeklyRows(list); setLoadingWeekly(false);
  })();},[store, selectedWeek]);

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[{key:'overview',label:'지회 보고 현황'},{key:'weekly',label:'주차별 제출현황'},{key:'notice',label:'공지사항'}]}
        active={tab}
        onChange={setTab}
      />

      {tab==='overview' && (
        loadingOverview ? <LoadingModal text="데이터를 불러오는 중…" /> : (
          <Card title="지회 보고 현황 (최근 4주)">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {BRANCHES.map(b=>{
                const arr=recentMap[b.id]||[]; const r=arr[0]||"NONE";
                return (
                  <div key={b.id} onClick={()=>onOpenBranch(b)} className="rounded-xl border border-neutral-200 p-4 bg-white hover:shadow-md cursor-pointer transition group">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-lg text-neutral-900 group-hover:text-neutral-700">{b.name}</h3>
                      <span className="text-neutral-400 text-xs">자세히 ▶</span>
                    </div>
                    <div className="mb-3"><StatusChip statusKey={r}/></div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-600">최근 4주
                      <div className="flex items-center gap-1 ml-2">
                        {(arr||[]).map((s,i)=> <span key={i} className={`inline-block w-3 h-3 rounded ${STATUS[s]?.color?.split(" ")[0]||"bg-neutral-300"}`} />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )
      )}

      {tab==='weekly' && (
        <Card title="주차별 제출현황">
          <div className="flex items-center gap-3 mb-4">
            <Select value={selectedWeek} onChange={e=>setSelectedWeek(e.target.value)}>
              {WEEKS.map(w=> <option key={w.id} value={w.id}>{w.label}</option>)}
            </Select>
          </div>
          {loadingWeekly ? <LoadingModal text="데이터를 불러오는 중…" /> : (
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr className="text-left text-sm text-neutral-700">
                    <th className="px-4 py-2">지회</th>
                    <th className="px-4 py-2">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {weeklyRows.map(({branch,status})=> (
                    <tr key={branch.id} className="odd:bg-neutral-50/40">
                      <td className="px-4 py-2">{branch.name}</td>
                      <td className="px-4 py-2"><StatusChip statusKey={status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab==='notice' && (
        <NoticeBoard store={store} isAdmin={true} />
      )}
    </div>
  );
}

// ----------------------------- 상세 보기 -----------------------------
function SubmissionDetail({branch,week,rec,store,onBack,onEdit}){
  const [previewOpen,setPreviewOpen]=useState(false);
  const [previewItem,setPreviewItem]=useState(null);
  const [downloading,setDownloading]=useState(false);

  const handleFileOpen = async (f)=>{
    try{
      const isString = typeof f === "string";
      const path = isString ? f : f?.path;
      const name = isString ? fileNameFromPath(f) : (f?.name || (path ? fileNameFromPath(path) : "파일"));
      const url = await store.getFileUrl(path);
      if(!url) return alert('파일을 불러올 수 없습니다.');

      // 일부 데모/비표준 URL일 수 있어서 http(s)인 경우에만 fetch로 blob 처리
      if(!url.startsWith('http')){
        // 비표준 URL (예: demo://...) 은 새 창으로 연다
        window.open(url, '_blank');
        return;
      }

      // fetch as blob to preserve filename on download and to enable preview
      setDownloading(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const ext = (name.split('.').pop()||'').toLowerCase();
      if(['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)){
        setPreviewItem({ type:'image', url:blobUrl, name }); setPreviewOpen(true);
      } else if(ext==='pdf'){
        setPreviewItem({ type:'pdf', url:blobUrl, name }); setPreviewOpen(true);
      } else {
        const a=document.createElement('a'); a.href=blobUrl; a.download=name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);
      }
    }catch(e){ console.error(e); alert('파일을 열 수 없습니다.'); }
    finally{ setDownloading(false); }
  };

  const handleDelete = async ()=>{
    if(!confirm('이 제출을 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.')) return;
    try{
      await store.deleteWeek(branch.id, week.id);
      alert('삭제되었습니다.');
      onBack && onBack();
    }catch(e){ console.error(e); alert('삭제에 실패했습니다.'); }
  };

  const handleFileDownload = async (f)=>{
    try{
      const isString = typeof f === "string";
      const path = isString ? f : f?.path;
      const name = isString ? fileNameFromPath(f) : (f?.name || (path ? fileNameFromPath(path) : "파일"));
      const url = await store.getFileUrl(path);
      if(!url) return alert('파일을 불러올 수 없습니다.');
      if(!url.startsWith('http')){ window.open(url,'_blank'); return; }
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=blobUrl; a.download=name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000);
    }catch(e){ console.error(e); alert('다운로드에 실패했습니다.'); }
  };

  return (
    <div className="space-y-4">
      <PreviewModal open={previewOpen} onClose={()=>{ setPreviewOpen(false); setPreviewItem(null); }} item={previewItem} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Btn onClick={onBack} variant="soft">↩ 목록</Btn>
          <h1 className="text-2xl font-extrabold text-neutral-900">{rec.title || "(제목 없음)"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip statusKey={rec.status} />
          <Btn variant="primary" onClick={onEdit}>수정</Btn>
          <Btn onClick={handleDelete} variant="danger">삭제</Btn>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 space-y-4">
        <div className="text-sm text-neutral-600">{branch.name} · {week.label}</div>
        <div className="text-sm text-neutral-600">제출일시: {rec.submittedAt ? new Date(rec.submittedAt).toLocaleString() : "—"}</div>
        <div className="whitespace-pre-wrap leading-relaxed min-h-[80px] text-neutral-800">{rec.note || "(내용 없음)"}</div>
        <div>
          <div className="font-semibold mb-2 text-neutral-900">첨부</div>
          {(rec.files && rec.files.length) ? (
            <div className="flex flex-col gap-2">
              {rec.files.map((f,i)=>{
                const isString = typeof f === "string";
                const path = isString ? f : f?.path;
                const name = isString ? fileNameFromPath(f) : (f?.name || (path ? fileNameFromPath(path) : "파일"));
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg hover:bg-neutral-50 w-fit" onClick={()=>handleFileOpen(f)} disabled={downloading}>📎 {name}</button>
                    <button className="text-sm text-neutral-500" onClick={()=>handleFileDownload(f)}>다운로드</button>
                  </div>
                );
              })}
            </div>
          ) : <div className="text-neutral-500">첨부 없음</div>}
        </div>
      </div>
    </div>
  );
}

// ----------------------------- 지회 홈 -----------------------------
function BranchHome({branch,store,isAdmin,onAdminBack,onOpenSubmit,onOpenDetail,refreshKey}){
  const [rows,setRows]=useState([]);
  const [tab,setTab]=useState('list'); // 'list' | 'notice'
  useEffect(()=>{(async()=>{
    // 속도개선: 주차 12개 데이터를 in() 한방으로
    const weekIds=WEEKS.map(w=>w.id);
    const map = await store.getRecordsForBranchWeeks(branch.id, weekIds);
    const arr=WEEKS.map(w=>({ week:w, rec: map.get(w.id)||{title:"",status:"NONE",note:"",files:[],submittedAt:null} }));
    setRows(arr);
  })();},[store,branch.id,refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          {isAdmin && <Btn onClick={onAdminBack} variant="soft">↩ 뒤로가기</Btn>}
          <h1 className="text-2xl font-extrabold text-neutral-900">{branch.name} — 제출현황</h1>
        </div>
        {tab==='list' && <Btn variant="primary" onClick={()=>onOpenSubmit(null)}>제출하기</Btn>}
      </div>

      <Tabs tabs={[{key:'list',label:'제출현황'},{key:'notice',label:'공지사항'}]} active={tab} onChange={setTab} />

      {tab==='list' && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-base leading-relaxed">
            <thead className="bg-neutral-50/80">
              <tr className="text-left text-neutral-700">
                <th className="px-5 py-3">주차</th>
                <th className="px-5 py-3">제목</th>
                <th className="px-5 py-3">제출일시</th>
                <th className="px-5 py-3 text-right">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {rows.map(({week,rec})=> (
                <tr key={week.id} className="odd:bg-neutral-50/40">
                  <td className="px-5 py-4 whitespace-nowrap text-neutral-800">{week.label}</td>
                  <td className="px-5 py-4"><button className="underline underline-offset-2 decoration-neutral-400 hover:decoration-neutral-800" onClick={()=>onOpenDetail(week.id)}>{rec.title||"(제목 없음)"}</button></td>
                  <td className="px-5 py-4 text-neutral-800">{rec.submittedAt ? new Date(rec.submittedAt).toLocaleString() : "—"}</td>
                  <td className="px-5 py-4 text-right"><StatusChip statusKey={rec.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='notice' && (
        <NoticeBoard store={store} isAdmin={isAdmin} />
      )}
    </div>
  );
}

// ----------------------------- 제출 폼 -----------------------------
function BranchSubmit({branch,store,onBack,initialWeekId=null,onSuccess}){
  const [week,setWeek]=useState(initialWeekId||WEEKS[0].id);
  const [title,setTitle]=useState("");
  const [status,setStatus]=useState("REPORT");
  const [note,setNote]=useState("");
  const [files,setFiles]=useState([]);
  const [saving,setSaving]=useState(false);
  const [progress,setProgress]=useState(0);

  useEffect(()=>{(async()=>{
    const rec=await store.getRecord(branch.id,week);
    if(rec){ setTitle(rec.title||""); setStatus(rec.status||"REPORT"); setNote(rec.note||""); }
  })();},[branch.id,week,store]);

  const submit = async () => {
    setSaving(true); setProgress(0);
    try{
      const prev = await store.getRecord(branch.id, week);
      const prevMetas = normalizeFilesField(prev?.files); // [{name,path}]

      // 파일 업로드: 진행률 애니메이션(천천히 증가)
      let uploadedMetas=[]; const total=(files?.length||0);
      if(total>0){
        let done=0; uploadedMetas=[];
        for(const f of files){
          const metas = await store.uploadFiles(branch.id, week, [f]);
          uploadedMetas.push(...metas); done+=1;
          // 부드러운 진행률(파일당 100/total 까지 여러 단계 증가)
          const target=Math.round((done/total)*100);
          let cur=progress; while(cur<target){ cur+=1; setProgress(cur); await new Promise(r=>setTimeout(r,8)); }
        }
      }

      // Merge previous metas and uploaded metas, unique by path
      const mapByPath = new Map();
      for(const m of (prevMetas||[])){ if(m?.path) mapByPath.set(m.path, { name:m.name, path:m.path }); }
      for(const m of (uploadedMetas||[])){ if(m?.path) mapByPath.set(m.path, { name:m.name, path:m.path }); }
      const filesToSave = Array.from(mapByPath.values());

      await store.setRecord(branch.id, week, { title, status, note, files: filesToSave, submittedAt: new Date().toISOString() });
      alert('제출 완료!');
      onSuccess && onSuccess(); onBack && onBack();
    }catch(e){ console.error(e); alert(e.message||'저장 실패'); }
    finally{ setSaving(false); setProgress(0); }
  };

  return (
    <div className="space-y-4">
      <Card title={`${branch.name} — 보고서 제출`}>
        <div className="space-y-5">
          <Field label="주차 선택">
            <Select value={week} onChange={e=>setWeek(e.target.value)}>
              {WEEKS.map(w=> <option key={w.id} value={w.id}>{w.label}</option>)}
            </Select>
          </Field>

          <Field label="제목"><Input placeholder="제목을 입력하세요" value={title} onChange={e=>setTitle(e.target.value)} /></Field>

          <div className="flex flex-wrap gap-4 py-1">
            {Object.values(STATUS).filter(s=>s.key!=="NONE").map(s=> (
              <label key={s.key} className="inline-flex items-center gap-2 text-neutral-800">
                <input type="radio" name="st" value={s.key} checked={status===s.key} onChange={e=>setStatus(e.target.value)} className="accent-emerald-600" />
                {s.label}
              </label>
            ))}
          </div>

          <Field label="내용"><Textarea rows={6} placeholder="내용을 입력하세요" value={note} onChange={e=>setNote(e.target.value)} /></Field>

          <div className="border-2 border-dashed rounded-xl p-6 bg-neutral-50 text-sm hover:bg-neutral-100 transition" onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault(); const dropped=Array.from(e.dataTransfer.files||[]); setFiles(prev=>[...prev,...dropped].slice(0,5));}}>
            여기로 파일을 끌어다 놓거나 아래 버튼으로 선택하세요 (최대 5개)
            <div className="mt-3"><input type="file" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))} /></div>
          </div>

          {saving && (
            <div className="w-full bg-neutral-200 rounded-full h-3 overflow-hidden">
              <div className="bg-emerald-500 h-3 transition-all" style={{ width: `${progress}%` }}></div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Btn variant="primary" onClick={submit} disabled={saving}>{saving?`업로드 중... ${progress}%`:'제출 저장'}</Btn>
            <Btn onClick={onBack} disabled={saving}>취소</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ----------------------------- App 루트 -----------------------------
export default function App(){
  const store = useStore();
  const [user,setUser]=useState(null);
  const [branch,setBranch]=useState(BRANCHES[0]);
  const [view,setView]=useState("LOGIN");
  const [initialWeekId,setInitialWeekId]=useState(null);
  const [detailWeekId,setDetailWeekId]=useState(null);
  const [refreshKey,setRefreshKey]=useState(0);

  const logout=()=>{ setUser(null); setView("LOGIN"); };
  const login=u=>{ setUser(u); if(u.role==="admin") setView("ADMIN"); else { setBranch(BRANCHES.find(x=>x.id===u.branchId)); setView("BRANCH"); } };
  const bump=()=> setRefreshKey(k=>k+1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto min-w-[1100px] max-w-[1400px] px-6 py-3 flex justify-between items-center">
          <div className="font-extrabold tracking-tight text-neutral-900 flex items-center gap-3">
            GB-UD 지회 보고포털 <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500 text-emerald-700">v0.6</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${store.storeType==='supabase' ? 'border-emerald-500 text-emerald-700' : 'border-neutral-400 text-neutral-600'}`}>
              {store.storeType==='supabase' ? 'Supabase' : 'Demo'}
            </span>
          </div>
          {user && (
            <div className="flex gap-2 items-center text-sm">
              <span className="text-neutral-700">{user.role==="admin" ? "관리자" : branch.name}</span>
              <Btn onClick={logout}>로그아웃</Btn>
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto min-w-[1100px] max-w-[1400px] px-10 py-8 space-y-6">
        {view==="LOGIN" && <Login onLogin={login} />}
        {view==="ADMIN" && (
          <AdminDashboard
            store={store}
            onOpenBranch={(b)=>{ setBranch(b); setView("BRANCH"); }}
          />
        )}
        {view==="BRANCH" && (
          <BranchHome
            branch={branch}
            store={store}
            isAdmin={user?.role==="admin"}
            onAdminBack={()=>setView("ADMIN")}
            onOpenSubmit={(w)=>{ setInitialWeekId(w||null); setView("SUBMIT"); }}
            onOpenDetail={(w)=>{ setDetailWeekId(w); setView("DETAIL"); }}
            refreshKey={refreshKey}
          />
        )}
        {view==="SUBMIT" && (
          <BranchSubmit
            branch={branch}
            store={store}
            onBack={()=>setView("BRANCH")}
            initialWeekId={initialWeekId}
            onSuccess={bump}
          />
        )}
        {view==="DETAIL" && (
          <DetailWrapper
            branch={branch}
            store={store}
            weekId={detailWeekId}
            onBack={()=>setView("BRANCH")}
            onEdit={()=>{ setInitialWeekId(detailWeekId); setView("SUBMIT"); }}
          />
        )}
      </main>
    </div>
  );
}

function DetailWrapper({branch,store,weekId,onBack,onEdit}){
  const [rec,setRec]=useState(null);
  const week = WEEKS.find(w=>w.id===weekId) || WEEKS[0];
  useEffect(()=>{(async()=>{ const r=await store.getRecord(branch.id, weekId); setRec(r); })();},[branch.id,weekId,store]);
  if(!rec) return <LoadingModal text="자료를 불러오는 중…" />;
  return <SubmissionDetail branch={branch} week={week} rec={rec} store={store} onBack={onBack} onEdit={onEdit}/>;
}
