import React from 'react';
export function TwoToneHeading({lead,accent,level='display',align='center',as='h1'}){
  const Tag=as;
  const isD=level==='display';
  return <Tag style={{font:isD?'var(--type-display)':'var(--type-h2)',letterSpacing:isD?'var(--track-display)':'var(--track-h2)',color:'var(--text-primary)',textAlign:align,margin:0,textWrap:'pretty'}}>{lead}{' '}<span style={{color:'var(--accent)'}}>{accent}</span></Tag>;
}
