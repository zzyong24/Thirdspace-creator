// Pure time -> pixels. Repeated and backwards seeking produce the same state.
const clamp = (x, a=0, b=1) => Math.min(b, Math.max(a, x));
const easeOut = x => 1-Math.pow(1-clamp(x),3);
window.seek = function(seconds) {
  const t=clamp(Number(seconds)||0,0,window.FILM.duration-1/window.FILM.fps);
  document.querySelectorAll('.shot').forEach(scene => {
    const start=Number(scene.dataset.start), end=Number(scene.dataset.end), local=t-start;
    const active=t>=start && t<end;
    scene.style.opacity=active?'1':'0';
    scene.style.pointerEvents=active?'auto':'none';
    scene.querySelectorAll('[data-enter]').forEach(el=>{
      const u=easeOut((local-Number(el.dataset.enter))/.45);
      el.style.opacity=String(u);
      el.style.transform=`translateY(${(1-u)*36}px)`;
    });
    const progress=scene.querySelector('.progress i');
    if(progress) progress.style.transform=`scaleX(${clamp(local/(end-start))})`;
  });
  window.CURRENT_TIME=t;
};
window.seek(0);
let clockOrigin=null, request=null;
window.stopFilm = () => {cancelAnimationFrame(request);request=null;clockOrigin=null;};
window.playFilm = () => {
  window.stopFilm();
  const loop = now => {
    clockOrigin ??= now;
    const t=(now-clockOrigin)/1000;
    window.seek(t);
    if(t<window.FILM.duration) request=requestAnimationFrame(loop);
  };
  request=requestAnimationFrame(loop);
};
// Playback clock is preview-only. Offline renderer calls seek directly.
