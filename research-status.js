(() => {
  const host = document.querySelector("#research-status");
  let current = null, timer;
  const estimates = {Song:[15,60],Album:[10,40],Artist:[15,90],Instrument:[10,60],Composer:[30,300],Decade:[1,10]};
  function draw() {
    if (!current) {host.hidden=true;return;}
    host.hidden=false;
    const tasks=[...current.tasks.values()];
    const pending=tasks.filter(task=>task.state==="pending");
    const unavailable=tasks.filter(task=>task.state==="unavailable");
    const seconds=Math.floor((Date.now()-current.started)/1000);
    host.querySelector("strong").textContent=pending.length ? "Research In Progress" : unavailable.length ? "Report Ready · Some Sources Unavailable" : "Research Complete";
    const timing=host.querySelector("[data-research-time]");
    const range=estimates[current.scope] || [10,60];
    timing.textContent=pending.length ? seconds+"s elapsed · "+(seconds>range[1] ? "Taking longer than estimated" : "Estimated total "+range[0]+"–"+range[1]+"s") : seconds+"s elapsed";
    host.querySelector("[data-research-detail]").textContent=pending.length ? "Still checking: "+pending.map(task=>task.label).join(" · ")+". You can keep reading." : unavailable.length ? "Available results are shown. Unavailable: "+unavailable.map(task=>task.label).join(" · ")+". Run this report again to retry." : "All requested checks have finished.";
    const progress=host.querySelector("progress");
    progress.max=tasks.length || 1;
    progress.value=tasks.length-pending.length;
    if (!pending.length) {clearInterval(timer);timer=null;}
  }
  function set(runId,key,state) {
    if (current?.runId!==runId || !current.tasks.has(key)) return;
    const task=current.tasks.get(key);
    if (task.state!=="unavailable") task.state=state;
    draw();
  }
  window.MilesResearch={
    reset() {clearInterval(timer);current=null;host.hidden=true;},
    start(runId,scope,tasks) {
      clearInterval(timer);
      current={runId,scope,started:Date.now(),tasks:new Map(Object.entries(tasks).map(([key,label])=>[key,{label,state:"pending"}]))};
      draw();timer=setInterval(draw,1000);
    },
    label(runId,key,label) {if(current?.runId===runId && current.tasks.has(key)) {current.tasks.get(key).label=label;draw();}},
    done(runId,key) {set(runId,key,"done");},
    unavailable(runId,key) {set(runId,key,"unavailable");},
    track(runId,key,promise) {
      return promise.then(value=>{set(runId,key,value===null?"unavailable":"done");return value;},error=>{set(runId,key,"unavailable");throw error;});
    },
    finish(runId) {
      if (current?.runId!==runId) return;
      for (const task of current.tasks.values()) if(task.state==="pending") task.state="done";
      draw();
    },
    fail(runId) {
      if (current?.runId!==runId) return;
      for (const task of current.tasks.values()) if(task.state==="pending") task.state="unavailable";
      draw();
    }
  };
})();
