import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FeatureVisual} from './presentations.jsx';
export function renderFilm(plan) {
  return renderToStaticMarkup(<main id="film" className="film-theme" style={{width: plan.width, height: plan.height}}>
    {plan.shots.map((s, i) => <section className={'shot shot-'+s.type} key={s.id} data-start={s.start} data-end={s.end}>
      <div className="overline">{plan.product} <span>{String(i+1).padStart(2,'0')}</span></div>
      <div className="shot-content">
        <div className="copy" data-film-motion="true" data-enter="0">{s.eyebrow && <div className="eyebrow">{s.eyebrow}</div>}<h1>{s.headlineEn && <span className="headline-en" lang="en">{s.headlineEn}</span>}<span className="headline-zh" lang="zh-CN">{s.headline}</span></h1><p>{s.description}</p></div>
        {['detail','workspace','macro'].includes(s.type) && <div className="visual"><FeatureVisual shot={s}/></div>}
      </div>
      <div className="footer"><span>{plan.demo ? '技术样片 · 需要替换为产品内容' : (plan.footer || '')}</span><div className="progress"><i/></div></div>
    </section>)}
  </main>);
}
