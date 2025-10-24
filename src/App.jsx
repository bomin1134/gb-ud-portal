// src/App.jsx
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/*
  GB-UD 지회 보고포털 — v0.3.0 (UI 리디자인: 명확한 대비/카드/포커스 링/지브라 테이블)
  - 관리자: gbudc / gbudc
  - 지회: gb001 ~ gb020 (비밀번호 동일)
  - .env.local 설정 시 Supabase LIVE, 미설정 시 메모리(DEMO)
*/

// ----------------------------- 기본 데이터 -----------------------------
const BRANCHES = [
  "포항시","경주시","김천시","안동시","구미시","영주시","영천시","상주시","문경시","경산시",
  "청송군","영양군","영덕군","청도군","고령군","성주군","칠곡군","예천군","봉화군","울진군"
].map((n,i)=>({ id: i+1, name: n }));

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
  OFFICIAL: { key:"OFFICIAL", label:"공문 제출",  color:"bg-orange-500/90 text-white" }
};

// ----------------------------- Week 유틸 -----------------------------
function startOfWeekMonday(d){
  const x=new Date(d);
  const n=x.getDay(); // 0=일,1=월
  const diff=(n===0?-6:1-n);
  x.setDate(x.getDate()+diff);
  x.setHours(0,0,0,0);
  return x;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function koreanOrdinal(n){ return ["첫째","둘째","셋째","넷째","다섯째"][n-1]||`${n}째`; }
function ymdLocal(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function weekLabelKorean(monday){
  const y=monday.getFullYear();
  const mIdx=monday.getMonth();
  const firstDay = new Date(y, mIdx, 1);
  const toMon   = (8 - firstDay.getDay()) % 7; // 첫 월요일까지 이동 일수
  const firstMon= new Date(y, mIdx, 1 + toMon);
  const diffDays = Math.floor((monday - firstMon) / (1000*60*60*24));
  const ordinal = diffDays < 0 ? 1 : Math.floor(diffDays/7) + 1;
  const m = mIdx + 1;
  return `${y} ${m}월 ${koreanOrdinal(ordinal)}주`;
}
function makeWeeks(c=12){
  const w=[]; let cur=startOfWeekMonday(new Date());
  for(let i=0;i<c;i++){
    const s=new Date(cur); const e=addDays(s,6);
    w.push({ id: ymdLocal(s), label: weekLabelKorean(s), start:s, end:e });
    cur=addDays(cur,-7);
  }
  return w;
}
const WEEKS = makeWeeks(12);

// ----------------------------- helpers -----------------------------
function fileNameFromPath(p){
  if(!p) return "파일";
  const parts = String(p).split("/");
  return parts[parts.length-1] || String(p);
}

// ----------------------------- 공용 컴포넌트 -----------------------------
function Btn({children,onClick,variant="neutral",className="",type="button"}){
  const base = "inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed";
  const style = variant==="primary"
    ? "bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm"
    : variant==="soft"
      ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 border border-neutral-200"
      : "bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-50";
  return <button type={type} onClick={onClick} className={`${base} ${style} ${className}`}>{children}</button>;
}

function Field({label,children,help}){
  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-semibold text-neutral-800">{label}</label>}
      {children}
      {help && <p className="text-xs text-neutral-500">{help}</p>}
    </div>
  );
}

function Input(props){
  return <input {...props} className={`w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent ${props.className||""}`} />;
}
function Textarea(props){
  return <textarea {...props} className={`w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent ${props.className||""}`} />;
}
function Select(props){
  return <select {...props} className={`w-full rounded-lg border border-neutral-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent ${props.className||""}`} />;
}

function Card({title,actions,children}){
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatusChip({statusKey}) {
  const s=STATUS[statusKey]||STATUS.NONE;
  return <span className={`inline-flex items-center gap-1 ${s.color} rounded-full px-3 py-1 text-xs shadow-sm`}>● {s.label}</span>;
}

// ----------------------------- Store (Supabase or Memory) -----------------------------
function useStore(){
  const url   = import.meta.env.VITE_SUPABASE_URL;
  const key   = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const bucket= import.meta.env.VITE_SUPABASE_BUCKET || "reports";
  const table = import.meta.env.VITE_SUPABASE_TABLE  || "submissions";

  if(url && key){
    const client=createClient(url,key);
    return {
      storeType:"supabase",
      async getRecord(branchId,weekId){
        const { data } = await client
          .from(table).select("*")
          .eq("id",`${branchId}_${weekId}`)
          .maybeSingle();
        if(!data) return { title:"", status:"NONE", note:"", files:[], submittedAt:null };

        const filesArr = Array.isArray(data.files)
          ? data.files
          : (typeof data.files === 'string' && data.files.length ? [data.files] : []);
        const normalizedFiles = filesArr.map(f => {
          if (typeof f === "string") {
            const name = fileNameFromPath(f);
            return { name, path: f };
          }
          return {
            name: f?.name ?? (f?.path ? fileNameFromPath(f.path) : "파일"),
            path: f?.path ?? null,
            url:  f?.url ?? null,
          };
        });

        return {
          title: data.title || "",
          status: data.status || "NONE",
          note: data.note || "",
          files: normalizedFiles,
          submittedAt: data.submitted_at || null
        };
      },
      async setRecord(branchId,weekId,rec){
        // files는 문자열 경로 배열로 통일 저장
        const filesField = Array.isArray(rec.files)
          ? rec.files.map(f => (typeof f === "string" ? f : f?.path)).filter(Boolean)
          : rec.files ?? null;
        const payload = {
          id:`${branchId}_${weekId}`,
          branch_id: branchId,
          week_id: weekId,
          title: rec.title ?? "",
          status: rec.status,
          note: rec.note,
          files: filesField,
          submitted_at: rec.submittedAt
        };
        const { error } = await client.from(table).upsert(payload);
        if (error) {
          console.error("DB upsert error", error, payload);
          throw new Error("DB 저장 실패: " + (error.message || JSON.stringify(error)));
        }
      },
      async uploadFiles(branchId,weekId,files){
        const metas=[];
        for(const f of (files||[])){
          // 안전한 업로드 키: ASCII만, 공백→_, 특수문자 제거, 길이 제한
          const origName = (f.name || "file").normalize("NFC");
          const dot = origName.lastIndexOf(".");
          const base = dot > -1 ? origName.slice(0, dot) : origName;
          const ext  = dot > -1 ? origName.slice(dot) : "";
          let safeBase = base
            .replace(/\s+/g, "_")
            .replace(/[^A-Za-z0-9._-]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(-100);
          const safeExt = ext.replace(/[^A-Za-z0-9.]/g, "").slice(0,10).toLowerCase();
          const safeName = (safeBase || "file") + (safeExt || "");
          const path = `gb${String(branchId).padStart(3,"0")}/${weekId}/${safeName}`;
          const { error } = await client.storage.from(bucket).upload(
            path,
            f,
            { upsert:true, contentType: f.type || undefined }
          );
          if(!error){
            metas.push({ name:safeName, path });
          } else {
            console.error("storage.upload error", error);
            alert("Storage 업로드 실패: " + (error?.message || JSON.stringify(error)));
          }
        }
        return metas; // [{name, path}]
      },
      async getFileUrl(path){
        const { data } = await client.storage.from(bucket).createSignedUrl(path, 60*60);
        return data?.signedUrl || null;
      },
      async deleteWeek(branchId,weekId){
        const prefix=`gb${String(branchId).padStart(3,"0")}/${weekId}`;
        const { data:list } = await client.storage.from(bucket).list(prefix);
        if(list?.length){ await client.storage.from(bucket).remove(list.map(f=>`${prefix}/${f.name}`)); }
        await client.from(table).upsert({
          id:`${branchId}_${weekId}`,
          branch_id: branchId,
          week_id: weekId,
          title: "",
          status:"NONE",
          note:"",
          files: [],
          submitted_at: null
        });
      }
    };
  }

  // 메모리(DEMO)
  const [map,setMap] = useState(new Map());
  return {
    storeType:"memory",
    async getRecord(b,w){ return map.get(`${b}_${w}`) || { title:"", status:"NONE", note:"", files:[], submittedAt:null }; },
    async setRecord(b,w,r){
      setMap(p=>{
        const n=new Map(p);
        const prev=n.get(`${b}_${w}`)||{};
        n.set(`${b}_${w}`, { ...prev, ...r });
        return n;
      });
    },
    async uploadFiles(b,w,files){
      if(!files?.length) return [];
      const metas=[];
      setMap(p=>{
        const n=new Map(p);
        const key=`${b}_${w}`;
        const prev=n.get(key)||{title:"", status:"NONE", note:"", files:[], submittedAt:null};
        const prevList = prev.files || [];
        const added = Array.from(files).map(f=>({ name:f.name, size:f.size, url:URL.createObjectURL(f) }));
        // 중복 제거(name+size 기준)
        const seen = new Set(prevList.map(x=>`${x.name}|${x.size}`));
        const dedupAdded = added.filter(x=>{ const k=`${x.name}|${x.size}`; if(seen.has(k)) return false; seen.add(k); return true;});
        metas.push(...dedupAdded);
        n.set(key, { ...prev, files:[...prevList, ...dedupAdded] });
        return n;
      });
      return metas; // [{name, size, url}]
    },
    async getFileUrl(path){ return path; },
    async deleteWeek(b,w){
      setMap(p=>{
        const n=new Map(p);
        n.set(`${b}_${w}`, { title:"", status:"NONE", note:"", files:[], submittedAt:null });
        return n;
      });
    }
  };
}

// ----------------------------- 로그인 -----------------------------
function Login({onLogin}){
  const [id,setId]=useState(""); const [pw,setPw]=useState(""); const [err,setErr]=useState("");
  const submit=(e)=>{ e.preventDefault();
    const u=USERS.find(v=>v.id===id && v.pw===pw);
    if(!u){ setErr("아이디 또는 비밀번호가 올바르지 않습니다."); return; }
    onLogin(u);
  };
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-neutral-900">GB-UD 지회 보고포털 로그인</h1>
        <Field label="아이디"><Input value={id} onChange={e=>setId(e.target.value)} /></Field>
        <Field label="비밀번호"><Input type="password" value={pw} onChange={e=>setPw(e.target.value)} /></Field>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <Btn type="submit" variant="primary" className="w-full">로그인</Btn>
      </form>
    </div>
  );
}

// ----------------------------- 관리자 대시보드 -----------------------------
function AdminDashboard({store,onOpenBranch}){
  const [recent,setRecent]=useState({});
  const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{
    const rec={};
    for(const b of BRANCHES){
      const arr=[];
      for(const w of WEEKS.slice(0,4)){
        const r=await store.getRecord(b.id,w.id);
        arr.push(r.status || "NONE");
      }
      rec[b.id]=arr;
    }
    setRecent(rec); setLoading(false);
  })();},[store]);

  if(loading) return <div className="p-6 text-neutral-500">데이터 불러오는 중…</div>;

  return (
    <div className="space-y-4">
      <Card title="지회 보고 현황">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BRANCHES.map(b=>{
            const r=recent[b.id]?.[0]||"NONE";
            return (
              <div key={b.id} onClick={()=>onOpenBranch(b)} className="rounded-xl border border-neutral-200 p-4 bg-white hover:shadow-md cursor-pointer transition group">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg text-neutral-900 group-hover:text-neutral-700">{b.name}</h3>
                  <span className="text-neutral-400 text-xs">자세히 ▶</span>
                </div>
                <div className="mb-3"><StatusChip statusKey={r}/></div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-600">최근 4주
                  <div className="flex items-center gap-1 ml-2">
                    {(recent[b.id]||[]).map((s,i)=>
                      <span key={i} className={`inline-block w-3 h-3 rounded ${STATUS[s]?.color?.split(" ")[0]||"bg-neutral-300"}`} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ----------------------------- 상세 보기 -----------------------------
function SubmissionDetail({branch,week,rec,store,onBack,onEdit}){
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Btn onClick={onBack} variant="soft">↩ 목록</Btn>
          <h1 className="text-2xl font-extrabold text-neutral-900">{rec.title || "(제목 없음)"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip statusKey={rec.status} />
          <Btn variant="primary" onClick={onEdit}>수정</Btn>
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
                if (store.storeType==='supabase' && path) {
                  return (
                    <button key={i} className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg hover:bg-neutral-50 w-fit"
                      onClick={async()=>{ const u=await store.getFileUrl(path); if(u) window.open(u,'_blank'); }}
                    >📎 {name}</button>
                  );
                }
                return <span key={i} className="text-neutral-600 text-sm">📎 {name}</span>;
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
  useEffect(()=>{(async()=>{
    const arr=[];
    for(const w of WEEKS){
      const r=await store.getRecord(branch.id,w.id);
      arr.push({week:w,rec:r});
    }
    setRows(arr);
  })();},[store,branch.id,refreshKey]);

  const handleDelete=async(weekId)=>{
    if(!confirm("정말 삭제하시겠습니까?")) return;
    await store.deleteWeek(branch.id,weekId);
    setRows(prev=>prev.map(r=>r.week.id===weekId?{...r,rec:{title:"", status:"NONE",note:"",files:[],submittedAt:null}}:r));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          {isAdmin && <Btn onClick={onAdminBack} variant="soft">↩ 뒤로가기</Btn>}
          <h1 className="text-2xl font-extrabold text-neutral-900">{branch.name} — 제출현황</h1>
        </div>
        <Btn variant="primary" onClick={()=>onOpenSubmit(null)}>제출하기</Btn>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-base leading-relaxed">
          <thead className="bg-neutral-50/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-50/60">
            <tr className="text-left text-neutral-700">
              <th className="px-5 py-3">주차</th>
              <th className="px-5 py-3">상태</th>
              <th className="px-5 py-3">제목</th>
              <th className="px-5 py-3">첨부</th>
              <th className="px-5 py-3">제출일시</th>
              <th className="px-5 py-3">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rows.map(({week,rec}, idx)=> (
              <tr key={week.id} className="odd:bg-neutral-50/40">
                <td className="px-5 py-4 whitespace-nowrap text-neutral-800">{week.label}</td>
                <td className="px-5 py-4"><StatusChip statusKey={rec.status}/></td>
                <td className="px-5 py-4 align-top min-h-[60px]">
                  <button className="underline underline-offset-2 decoration-neutral-400 hover:decoration-neutral-800" onClick={()=>onOpenDetail(week.id)}>{rec.title || "(제목 없음)"}</button>
                </td>
                <td className="px-5 py-4 align-top text-sm">
                  {(rec.files && rec.files.length) ? (
                    <div className="flex flex-col gap-1 max-w-[300px]">
                      {rec.files.map((f,i)=>{
                        const isString = typeof f === "string";
                        const path = isString ? f : f?.path;
                        const name = isString ? fileNameFromPath(f) : (f?.name || (path ? fileNameFromPath(path) : "파일"));
                        if (store.storeType === 'supabase' && path) {
                          return (
                            <button key={i}
                              onClick={async()=>{ const u=await store.getFileUrl(path); if(u) window.open(u,'_blank'); }}
                              className="inline-flex items-center gap-2 px-2 py-1 border border-neutral-200 rounded-lg hover:bg-neutral-50 truncate text-left"
                              title={name}
                            >
                              📎 <span className="truncate max-w-[240px]">{name}</span>
                            </button>
                          );
                        }
                        return <span key={i} className="text-neutral-700">📎 {name}</span>;
                      })}
                    </div>
                  ) : <span className="text-neutral-400">—</span>}
                </td>
                <td className="px-5 py-4 text-neutral-800">{rec.submittedAt ? new Date(rec.submittedAt).toLocaleString() : "—"}</td>
                <td className="px-5 py-4 text-sm">
                  <button className="underline mr-3 underline-offset-2 hover:text-neutral-900" onClick={()=>onOpenSubmit(week.id)}>수정</button>
                  <button className="underline text-red-600 underline-offset-2 hover:text-red-700" onClick={()=>handleDelete(week.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [done,setDone]=useState(false);
  const [errMsg,setErrMsg]=useState("");

  useEffect(()=>{(async()=>{
    const rec=await store.getRecord(branch.id,week);
    if(rec){ setTitle(rec.title||""); setStatus(rec.status||"REPORT"); setNote(rec.note||""); }
  })();},[branch.id,week,store]);

  const submit = async () => {
    const prev = await store.getRecord(branch.id, week);
    const prevFiles = Array.isArray(prev?.files) ? prev.files : [];

    let uploadedMetas = [];
    try{
      if(files?.length && store.uploadFiles){
        uploadedMetas = await store.uploadFiles(branch.id, week, files);
        if (store.storeType === 'supabase' && files.length > 0 && uploadedMetas.length === 0) {
          alert('업로드가 시도되었지만 저장된 파일 메타가 비었습니다. (버킷/정책/경로 확인)');
        }
      }
    }catch(e){
      console.error("uploadFiles failed:", e);
      setErrMsg("파일 업로드는 실패했지만 제목/상태/내용은 저장합니다.");
    }

    // 문자열 경로만 병합
    const prevPaths = (Array.isArray(prevFiles) ? prevFiles : [])
      .map(f => (typeof f === "string" ? f : f?.path))
      .filter(Boolean);
    const newPaths = (Array.isArray(uploadedMetas) ? uploadedMetas : [])
      .map(m => m?.path)
      .filter(Boolean);
    const filesToSave = Array.from(new Set([...prevPaths, ...newPaths]));

    try{
      await store.setRecord(branch.id, week, {
        title,
        status,
        note,
        files: filesToSave,
        submittedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("setRecord failed:", e);
      alert(String(e?.message || e));
      setErrMsg("저장에 실패했습니다.");
      return;
    }

    setDone(true);
    onSuccess && onSuccess();
    onBack && onBack();
  };

  if(done){
    return (
      <div className="space-y-3">
        <p className="font-bold text-xl">제출 완료!</p>
        <Btn onClick={onBack} variant="primary">지회 화면으로</Btn>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title={`${branch.name} — 보고서 제출`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="주차 선택"><Select value={week} onChange={e=>setWeek(e.target.value)}>{WEEKS.map(w=> <option key={w.id} value={w.id}>{w.label}</option>)}</Select></Field>
          <Field label="제목"><Input placeholder="제목을 입력하세요" value={title} onChange={e=>setTitle(e.target.value)} /></Field>
        </div>

        <div className="flex flex-wrap gap-4 py-1">
          {Object.values(STATUS).filter(s=>s.key!=="NONE").map(s=> (
            <label key={s.key} className="inline-flex items-center gap-2 text-neutral-800">
              <input type="radio" name="st" value={s.key} checked={status===s.key} onChange={e=>setStatus(e.target.value)} className="accent-emerald-600" />
              {s.label}
            </label>
          ))}
        </div>

        <Field label="내용">
          <Textarea rows={6} placeholder="내용을 입력하세요" value={note} onChange={e=>setNote(e.target.value)} />
        </Field>

        <div
          className="border-2 border-dashed rounded-xl p-6 bg-neutral-50 text-sm hover:bg-neutral-100 transition"
          onDragOver={e=>{e.preventDefault();}}
          onDrop={e=>{e.preventDefault(); const dropped=Array.from(e.dataTransfer.files||[]); setFiles(prev=>[...prev,...dropped].slice(0,5));}}
        >
          여기로 파일을 끌어다 놓거나 아래 버튼으로 선택하세요 (최대 5개)
          <div className="mt-3"><input type="file" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))} /></div>
        </div>

        {errMsg && <div className="text-red-600 text-sm">{errMsg}</div>}

        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="font-semibold mb-2 text-sm text-neutral-900">첨부 미리보기</div>
          {files && files.length ? (
            <ul className="space-y-1">
              {files.map((f,i)=>(
                <li key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-800 truncate max-w-[360px]">{f.name}</span>
                    <span className="text-neutral-400">({Math.round((f.size||0)/1024)} KB)</span>
                  </div>
                  <button className="text-red-600 hover:text-red-700" onClick={()=>setFiles(prev=>prev.filter((_,idx)=>idx!==i))}>삭제</button>
                </li>
              ))}
            </ul>
          ) : <div className="text-neutral-500 text-xs">첨부 파일 없음</div>}
        </div>

        <div className="flex gap-2 pt-2">
          <Btn variant="primary" onClick={submit}>제출 저장</Btn>
          <Btn onClick={onBack}>취소</Btn>
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
  const login=u=>{
    setUser(u);
    if(u.role==="admin") setView("ADMIN");
    else { setBranch(BRANCHES.find(x=>x.id===u.branchId)); setView("BRANCH"); }
  };
  const bump=()=> setRefreshKey(k=>k+1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto min-w-[1100px] max-w-[1400px] px-6 py-3 flex justify-between items-center">
          <div className="font-extrabold tracking-tight text-neutral-900 flex items-center gap-3">
            GB-UD 지회 보고포털 <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-500 text-emerald-700">v0.3</span>
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
  if(!rec) return <div className="p-6 text-neutral-500">불러오는 중…</div>;
  return <SubmissionDetail branch={branch} week={week} rec={rec} store={store} onBack={onBack} onEdit={onEdit}/>;
}
