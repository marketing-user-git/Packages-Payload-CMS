'use client'
import {useEffect,useMemo,useState} from 'react'
import {Bar,BarChart,CartesianGrid,Cell,Line,LineChart,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import styles from './RegFunnelDashboard.module.css'

const API='/api/regfunnel/stats'
const RANGES=[30,90,180,365,1000,3650]
const STATES=['in_progress','converted','completed','excluded']
const APP_LABELS={global:'Global',china:'China'}
const STATE_LABELS={in_progress:'In Progress',converted:'Converted',completed:'Completed',excluded:'Excluded'}
const sum=(rows,key)=>rows.reduce((t,r)=>t+Number(r?.[key]||0),0)
const fmt=v=>Number(v||0).toLocaleString()
const pct=(a,b,d=1)=>b>0?`${((Number(a||0)/Number(b))*100).toFixed(d)}%`:'—'
const shortStep=v=>!v||v==='00_no_email_yet'?'Before first email':String(v).replace(/^\d+_/,'').replaceAll('_',' ')
const dateTime=v=>v?new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'—'
const relativeDue=v=>{if(!v)return'—';const diff=new Date(v).getTime()-Date.now(),h=Math.round(Math.abs(diff)/3600000);if(h<1)return diff>=0?'Due soon':'Overdue';if(h<48)return diff>=0?`In ${h}h`:`${h}h overdue`;const d=Math.round(h/24);return diff>=0?`In ${d}d`:`${d}d overdue`}

function StatusPill({state}){return <span className={`${styles.statusPill} ${styles[`status_${state}`]}`}>{STATE_LABELS[state]||state}</span>}
function Kpi({label,value,note,tone,icon}){return <div className={`${styles.kpi} ${styles[`kpi_${tone}`]}`}><div className={styles.kpiTop}><span className={styles.icon}>{icon}</span><div><span>{label}</span><strong>{fmt(value)}</strong></div></div><small>{note}</small></div>}
function Panel({title,sub,action,children,className=''}){return <section className={`${styles.panel} ${className}`}><div className={styles.panelHead}><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action&&<div className={styles.panelAction}>{action}</div>}</div>{children}</section>}

export default function RegFunnelDashboard({onBack}){
  const [days,setDays]=useState(1000),[region,setRegion]=useState('All'),[app,setApp]=useState('All'),[variant,setVariant]=useState('All'),[search,setSearch]=useState('')
  const [stats,setStats]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('')

  useEffect(()=>{let stop=false;setLoading(true);setError('');fetch(`${API}?days=${days}`,{credentials:'include'}).then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||`Request failed (${r.status})`);return b}).then(b=>{if(!stop)setStats(b)}).catch(e=>{if(!stop)setError(e?.message||'Could not load RegFunnelOps data.')}).finally(()=>{if(!stop)setLoading(false)});return()=>{stop=true}},[days])

  const data=stats||{},sequences=data.sequences||{ROW:[],CNJP:[]}
  const matches=r=>(region==='All'||r.funnel_region===region)&&(app==='All'||r.os_app===app)&&(variant==='All'||r.variant===variant)
  const states=(data.states||[]).filter(matches),engagement=(data.engagement||[]).filter(matches),currentByStep=(data.currentByStep||[]).filter(matches),convertedByStep=(data.convertedByStep||[]).filter(matches)
  const enrolled=sum(states,'n'),stateCounts=Object.fromEntries(STATES.map(s=>[s,sum(states.filter(r=>r.state===s),'n')]))
  const sent=sum(engagement,'sent'),delivered=sum(engagement,'delivered'),noRecipient=sum(engagement,'no_recipient'),sendErrors=sum(engagement,'errors'),unsubscribed=sum(engagement,'unsubscribed')
  const sendHealth=[['Sent',sent,'#31e6b5'],['No recipient',noRecipient,'#3ab8ff'],['Errors',sendErrors,'#ff5f73'],['Unsubscribed',unsubscribed,'#a778ff']].map(([name,value,tone])=>({name,value,tone}))
  const abRows=['A','B'].map(v=>{const s=states.filter(r=>r.variant===v),e=engagement.filter(r=>r.variant===v),n=sum(s,'n'),converted=sum(s.filter(r=>r.state==='converted'),'n');return{variant:v,enrolled:n,converted,conversionRate:n?(converted/n)*100:0,sent:sum(e,'sent')}})
  const currentStepMap=useMemo(()=>{const m=new Map();for(const r of currentByStep)m.set(r.step_id,(m.get(r.step_id)||0)+Number(r.n||0));return m},[currentByStep])
  const sequence=region==='CNJP'?sequences.CNJP||[]:sequences.ROW||[]
  const journeySteps=sequence.map((step,i)=>({step,index:i+1,active:currentStepMap.get(step)||0}))
  const trend=(data.trend||[]).map(r=>({...r,enrolled:Number(r.enrolled||0),converted:Number(r.converted||0),completed:Number(r.completed||0)}))
  const regionPerformance=['ROW','CNJP'].map(reg=>{const rows=(data.states||[]).filter(r=>r.funnel_region===reg),total=sum(rows,'n'),converted=sum(rows.filter(r=>r.state==='converted'),'n');return{region:reg,total,rate:total?(converted/total)*100:0}})
  const conversionByStep=useMemo(()=>{const m=new Map();for(const r of convertedByStep)m.set(r.step_id,(m.get(r.step_id)||0)+Number(r.n||0));return[...m].map(([step,value])=>({step:shortStep(step),value}))},[convertedByStep])
  const recent=(data.recentEnrollments||[]).filter(r=>{if(region!=='All'&&r.funnel_region!==region)return false;if(app!=='All'&&r.os_app!==app)return false;if(variant!=='All'&&r.variant!==variant)return false;if(search.trim()){const q=search.trim().toLowerCase(),hay=[r.external_id,r.country,r.culture,r.current_step,r.state,r.os_app,r.funnel_region].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(q))return false}return true})
  const legacySteps=engagement.filter(r=>!(sequences[r.funnel_region]||[]).includes(r.step_id))

  if(loading)return <div className={styles.loading}>Loading live RegFunnelOps data…</div>
  if(error)return <div className={styles.errorBox}>RegFunnelOps could not load: {error}</div>

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><div className={styles.brandMark}>RF</div><div><strong>RegFunnelOps</strong><small>Marketing Operations</small></div></div>
      <nav className={styles.nav}><a className={styles.navActive} href="#overview">⌂ <span>Overview</span></a><a href="#enrollments">▣ <span>Enrollments</span></a><a href="#journey">⇄ <span>Journey</span></a><a href="#ab">⚗ <span>A/B Tests</span></a><a href="#send-health">✉ <span>Sends & Errors</span></a><a href="#regions">◎ <span>Regions</span></a></nav>
      <div className={styles.sidebarQuote}><strong>Smarter journeys.<br/>Higher impact.</strong><span>Monitor. Learn. Convert.</span></div>
    </aside>

    <main className={styles.main} id="overview">
      <div className={styles.topbar}>
        <label className={styles.search}><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recent enrollments, IDs or steps…"/></label>
        <div className={styles.topFilters}>
          <select value={days} onChange={e=>setDays(Number(e.target.value))}>{RANGES.map(v=><option key={v} value={v}>Last {v} days</option>)}</select>
          <select value={app} onChange={e=>setApp(e.target.value)}><option value="All">All Apps</option><option value="global">Global</option><option value="china">China</option></select>
          <select value={region} onChange={e=>setRegion(e.target.value)}><option value="All">All Regions</option><option value="ROW">ROW</option><option value="CNJP">CN / JP</option></select>
          <select value={variant} onChange={e=>setVariant(e.target.value)}><option value="All">All Variants</option><option value="A">Variant A</option><option value="B">Variant B</option></select>
          {onBack&&<button className={styles.backBtn} onClick={onBack}>Back</button>}
        </div>
      </div>

      <header className={styles.hero}><div><h1>RegFunnelOps</h1><p>Registration funnel operations to turn interest into impact.</p></div><span>LESS FRICTION. MORE PEOPLE FORWARD.</span></header>
      <section className={styles.kpiGrid}>
        <Kpi label="Enrolled" value={enrolled} note={`Cohort: last ${days} days`} tone="cyan" icon="◉"/><Kpi label="In Progress" value={stateCounts.in_progress} note={pct(stateCounts.in_progress,enrolled)} tone="blue" icon="▶"/><Kpi label="Converted" value={stateCounts.converted} note={`${pct(stateCounts.converted,enrolled)} conversion`} tone="green" icon="▥"/><Kpi label="Completed" value={stateCounts.completed} note={pct(stateCounts.completed,enrolled)} tone="teal" icon="✓"/><Kpi label="Excluded" value={stateCounts.excluded} note={pct(stateCounts.excluded,enrolled)} tone="red" icon="⊘"/>
      </section>

      <section className={styles.topGrid}>
        <Panel title="Funnel Journey" sub={region==='All'?'ROW sequence shown. Use region filter to inspect CN / JP.':`${region==='CNJP'?'CN / JP':'ROW'} sequence`} className={styles.journeyPanel} action={<span>{journeySteps.length} live steps</span>}>
          <div className={styles.journeyViewport} id="journey"><div className={styles.journeySteps}>{journeySteps.map(x=><div className={styles.journeyStep} key={x.step}><span className={styles.stepIndex}>{x.index}</span><strong title={shortStep(x.step)}>{shortStep(x.step)}</strong><small>{x.active?`${x.active} active`:'No active users'}</small></div>)}</div></div>
          <div className={styles.miniChart}>{trend.length>1?<ResponsiveContainer width="100%" height={110}><BarChart data={trend.slice(-24)}><Bar dataKey="enrolled" fill="#16d9d3" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>:<div className={styles.chartEmpty}>More enrollment dates are needed to build a trend.</div>}</div>
        </Panel>

        <Panel title="Send Health" sub="Delivery and send outcomes" className={styles.sendPanel}><div className={styles.sendHealth} id="send-health"><div className={styles.donut}><ResponsiveContainer width="100%" height={185}><PieChart><Pie data={sendHealth} dataKey="value" innerRadius={55} outerRadius={76} paddingAngle={2}>{sendHealth.map(x=><Cell key={x.name} fill={x.tone}/>)}</Pie></PieChart></ResponsiveContainer><div className={styles.donutCenter}><strong>{fmt(sent+noRecipient+sendErrors)}</strong><span>Total attempts</span></div></div><div className={styles.legend}>{sendHealth.map(x=><div key={x.name}><i style={{background:x.tone}}/><span>{x.name}</span><strong>{fmt(x.value)}</strong></div>)}</div></div><div className={`${styles.healthNote} ${sendErrors>0?styles.healthWarn:''}`}>{sendErrors>0?`${sendErrors} send error(s) need review.`:sent>0&&delivered===0?'Sends are healthy. Delivery events are not recorded yet.':'Send health is stable.'}</div></Panel>

        <Panel title="A/B Test Performance" sub="Sequence-level conversion" className={styles.abPanel} action={<span id="ab">Conversion Rate</span>}><div className={styles.abList}>{abRows.map(r=><div className={styles.abRow} key={r.variant}><div className={styles.variantBadge}>{r.variant}</div><div className={styles.abBody}><div><strong>Variant {r.variant}</strong><span>{fmt(r.converted)} / {fmt(r.enrolled)}</span></div><div className={styles.progress}><i style={{width:`${Math.min(100,r.conversionRate)}%`}}/></div></div><strong>{r.conversionRate.toFixed(1)}%</strong></div>)}</div></Panel>
      </section>

      <section className={styles.midGrid}>
        <Panel title="Performance Over Time" sub="Enrollment cohort trend" className={styles.performancePanel}>{trend.length>1?<ResponsiveContainer width="100%" height={230}><LineChart data={trend}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="day" tick={{fill:'#758da6',fontSize:10}} minTickGap={26}/><YAxis tick={{fill:'#758da6',fontSize:10}} width={36}/><Tooltip contentStyle={{background:'#0b2035',border:'1px solid #1c3b56',borderRadius:10}}/><Line dataKey="enrolled" stroke="#25c9ff" strokeWidth={2.2} dot={false}/><Line dataKey="converted" stroke="#31e6b5" strokeWidth={2.2} dot={false}/></LineChart></ResponsiveContainer>:<div className={styles.chartEmptyLarge}><strong>Trend not available yet</strong><span>Your test cohort has only one enrollment date. This chart will populate automatically as new users enroll.</span></div>}</Panel>

        <Panel title="Top Insights" sub="Operational signals" className={styles.insightsPanel}><div className={styles.insights}><div><i className={styles.good}>↗</i><span><strong>Conversion rate</strong><small>{pct(stateCounts.converted,enrolled)} of the selected cohort has converted.</small></span></div><div><i className={sendErrors?styles.bad:styles.good}>!</i><span><strong>Send errors</strong><small>{sendErrors?`${sendErrors} error(s) recorded in SendLog.`:'No send errors in this cohort.'}</small></span></div><div><i className={sent>0&&delivered===0?styles.bad:styles.info}>i</i><span><strong>Delivery tracking</strong><small>{sent>0&&delivered===0?'Emails were sent, but no delivery events have been captured yet.':`${fmt(delivered)} delivered event(s) recorded.`}</small></span></div><div><i className={legacySteps.length?styles.bad:styles.info}>✓</i><span><strong>Sequence integrity</strong><small>{legacySteps.length?`${legacySteps.length} legacy step row(s) detected.`:'All engagement rows match the live sequences.'}</small></span></div></div></Panel>

        <Panel title="Regional Performance" sub="Conversion rate by funnel region" className={styles.regionPanel}><div className={styles.regionList} id="regions">{regionPerformance.map(r=><div key={r.region}><span>{r.region==='CNJP'?'CN / JP':r.region}</span><div className={styles.regionBar}><i style={{width:`${Math.min(100,r.rate)}%`}}/></div><strong>{r.rate.toFixed(1)}%</strong></div>)}</div></Panel>
      </section>

      {conversionByStep.length>0&&<Panel title="Conversions by Step" sub="Last email sent before conversion"><ResponsiveContainer width="100%" height={180}><BarChart data={conversionByStep} layout="vertical"><CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false}/><XAxis type="number" tick={{fill:'#758da6',fontSize:10}}/><YAxis type="category" dataKey="step" width={150} tick={{fill:'#9bb0c3',fontSize:10}}/><Tooltip contentStyle={{background:'#0b2035',border:'1px solid #1c3b56',borderRadius:10}}/><Bar dataKey="value" fill="#31e6b5" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></Panel>}

      <Panel title="Recent Enrollments" sub="Live enrollment state and next scheduled action" className={styles.enrollmentPanel} action={<span>{recent.length} shown</span>}><div className={styles.tableWrap} id="enrollments"><table><thead><tr><th>External ID</th><th>Country</th><th>Culture</th><th>Region</th><th>App</th><th>Variant</th><th>State</th><th>Current Step</th><th>Next Send</th><th>Enrolled At</th></tr></thead><tbody>{!recent.length&&<tr><td colSpan={10} className={styles.empty}>{search?'No recent enrollments match your search.':'No enrollments in this cohort.'}</td></tr>}{recent.map(r=><tr key={r.external_id}><td><strong>{r.external_id}</strong></td><td>{r.country||'—'}</td><td>{r.culture||'—'}</td><td>{r.funnel_region==='CNJP'?'CN / JP':r.funnel_region}</td><td>{APP_LABELS[r.os_app]||r.os_app}</td><td><b className={styles.variantText}>{r.variant}</b></td><td><StatusPill state={r.state}/></td><td title={r.current_step}>{shortStep(r.current_step)}</td><td className={r.next_send_at&&new Date(r.next_send_at)<new Date()?styles.overdue:''}>{relativeDue(r.next_send_at)}</td><td>{dateTime(r.enrolled_at)}</td></tr>)}</tbody></table></div></Panel>
      <footer className={styles.footer}>Live RegFunnelOps data · cohort basis: {data.cohortBasis||'enrolledAt'} · generated {dateTime(data.generatedAt)}</footer>
    </main>
  </div>
}
