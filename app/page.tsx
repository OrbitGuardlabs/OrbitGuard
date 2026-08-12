'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  Code2,
  LockKeyhole,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'

const features = [
  { icon: LockKeyhole, title: 'Declare the boundary', text: 'Scope every agent to the contracts, functions, assets and limits it actually needs.' },
  { icon: Play, title: 'Simulate before execution', text: 'See what will happen, why it is allowed, and what approval path it will take.' },
  { icon: ShieldCheck, title: 'Record every decision', text: 'Create a verifiable audit trail for every intent, policy check and transaction.' },
]

const codeLines = [
  ['01', 'const policy = orbit.policy({', 'plain'],
  ['02', '  agent: ', 'plain'],
  ['03', '  contracts: [', 'plain'],
  ['04', '    ', 'plain'],
  ['05', '  ],', 'plain'],
  ['06', '  limits: { perTransaction: ', 'plain'],
  ['07', '  approvals: { above: ', 'plain'],
  ['08', '})', 'plain'],
]

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [simulated, setSimulated] = useState(false)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <main className="landing-shell">
      <nav className={`landing-nav ${menuOpen ? 'is-open' : ''}`}>
        <button className="landing-brand" onClick={() => scrollTo('top')} aria-label="OrbitGuard home">
          <span className="brand-mark"><i /><i /><i /><i /></span><span>orbit<span>guard</span></span>
        </button>
        <div className="nav-links">
          <button onClick={() => scrollTo('how-it-works')}>How it works</button>
          <button onClick={() => scrollTo('features')}>Features</button>
          <button onClick={() => scrollTo('developers')}>Developers</button>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub <Code2 size={14} /></a>
        </div>
        <div className="nav-cta"><button className="nav-login">Sign in</button><button className="nav-button" onClick={() => scrollTo('demo')}>Get started <ArrowRight size={14} /></button></div>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="status-pill"><span className="live-dot" /> Open source permission layer for Stellar <ArrowRight size={13} /></div>
          <h1>Let agents move fast.<br /><em>Keep control.</em></h1>
          <p className="hero-lede">OrbitGuard gives autonomous agents a clear, enforceable boundary on Stellar — before they touch your money or your contracts.</p>
          <div className="hero-actions"><button className="button primary" onClick={() => scrollTo('demo')}>Explore the console <ArrowRight size={16} /></button><a className="button ghost" href="https://github.com" target="_blank" rel="noreferrer"><Code2 size={16} /> View on GitHub</a></div>
          <div className="hero-note"><Check size={13} /> No custody. No black boxes. Just policy.</div>
        </div>
        <div className="hero-visual" aria-label="OrbitGuard policy preview">
          <div className="visual-glow" />
          <div className="orbit-card">
            <div className="orbit-card-top"><span><span className="mini-status" /> Live policy check</span><span className="mono">12:42:08</span></div>
            <div className="orbit-agent"><div className="agent-symbol"><Sparkles size={16} /></div><div><strong>treasury-rebalancer</strong><small>Requesting action</small></div><span className="allowed-tag"><Check size={12} /> Allowed</span></div>
            <div className="request-box"><div><span>CONTRACT</span><strong>soroswap_router</strong></div><div><span>FUNCTION</span><strong>swapExactTokensForTokens</strong></div><div><span>AMOUNT</span><strong>1,250 USDC</strong></div></div>
            <div className="decision"><div className="decision-icon"><ShieldCheck size={17} /></div><div><strong>Within policy boundary</strong><small>3 checks passed · no approval required</small></div><span className="mono">42ms</span></div>
          </div>
          <div className="float-card float-top"><span className="float-icon"><LockKeyhole size={14} /></span><div><strong>Policy enforced</strong><small>Every transaction</small></div></div>
          <div className="float-card float-bottom"><span className="float-icon violet"><Zap size={14} /></span><div><strong>Fully auditable</strong><small>1,635 actions logged</small></div></div>
        </div>
      </section>

      <div className="trust-row"><span>Built for teams building with</span><strong>STELLAR</strong><span className="trust-rule" /><span>Open source by design</span><strong className="trust-github"><Code2 size={15} /> GITHUB</strong></div>

      <section className="section features-section" id="features"><div className="section-kicker">THE MISSING LAYER</div><h2>Autonomy needs a <span>guardrail.</span></h2><p className="section-intro">The fastest way to ship agentic finance is to make the safe path the easy path.</p><div className="feature-grid">{features.map(({ icon: Icon, title, text }, i) => <article className="feature-card" key={title}><div className="feature-index">0{i + 1}</div><div className="feature-icon"><Icon size={19} /></div><h3>{title}</h3><p>{text}</p><ArrowRight size={16} className="feature-arrow" /></article>)}</div></section>

      <section className="section workflow-section" id="how-it-works"><div className="workflow-copy"><div className="section-kicker">HOW IT WORKS</div><h2>From intent to <span>execution.</span></h2><p>OrbitGuard sits between your agent and the Stellar network. Every action is checked, explained and recorded — without slowing your agent down.</p><div className="workflow-list"><div><b>01</b><span><strong>Define</strong><small>Write policies in TypeScript or YAML.</small></span></div><div><b>02</b><span><strong>Simulate</strong><small>Preview the outcome before signing.</small></span></div><div><b>03</b><span><strong>Execute</strong><small>Pass only when the boundary is clear.</small></span></div></div></div><div className="code-window" id="developers"><div className="window-bar"><span><i /><i /><i /></span><small>orbitguard.config.ts</small><Code2 size={14} /></div><div className="code-body">{codeLines.map(([num, text], i) => <div key={num} className="code-line"><span>{num}</span><code>{i === 1 ? <>{text}<b>treasury-rebalancer</b>,</> : i === 3 ? <>    <b>'soroswap_router'</b>, <b>'blend_pool_v2'</b></> : i === 5 ? <>{text}<b>10_000</b>,</> : i === 6 ? <>{text}<b>5_000</b> {"},"}</> : text}</code></div>)}</div><div className="code-footer"><span><Circle size={8} fill="currentColor" /> Type-safe by default</span><span>orbitguard/sdk</span></div></div></section>

      <section className="demo-section" id="demo"><div className="demo-inner"><div><div className="section-kicker">THE CONTROL PLANE</div><h2>Make your next agent<br /><span>safe by default.</span></h2><p>Start with a policy. Get a permission layer that grows with your agents, not against them.</p></div><div className="demo-actions"><button className="button primary" onClick={() => setSimulated(true)}><Play size={15} /> {simulated ? 'Simulation ready' : 'Try a simulation'} <ArrowRight size={15} /></button><a className="button demo-ghost" href="https://github.com" target="_blank" rel="noreferrer"><Code2 size={15} /> Read the source</a>{simulated && <div className="demo-success"><Check size={13} /> Policy loaded. Your boundary is ready.</div>}</div></div></section>

      <footer className="landing-footer"><div className="landing-brand"><span className="brand-mark"><i /><i /><i /><i /></span><span>orbit<span>guard</span></span></div><span>Permission infrastructure for autonomous agents.</span><span>© 2026 Orbit Labs</span></footer>
    </main>
  )
}
