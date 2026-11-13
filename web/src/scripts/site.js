// Site interactions. Everything works without this file; it adds
// menus, reveals, filters, dialogs and the action plan.

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null')
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {}
  },
}

/* ---------- Header: translucent once content scrolls under it ---------- */
const header = $('[data-header]')
if (header) {
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8)
  onScroll()
  addEventListener('scroll', onScroll, {passive: true})
}

/* ---------- Desktop dropdowns ---------- */
const menus = $$('[data-menu]')
let openMenu = null
function setMenu(li, open) {
  const btn = $('[data-trigger]', li)
  if (!btn) return
  btn.setAttribute('aria-expanded', String(open))
  li.classList.toggle('open', open)
  if (open) {
    if (openMenu && openMenu !== li) setMenu(openMenu, false)
    openMenu = li
  } else if (openMenu === li) openMenu = null
}
menus.forEach((li) => {
  const btn = $('[data-trigger]', li)
  if (!btn) return
  let t
  // Respond on press, not release
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    setMenu(li, !li.classList.contains('open'))
  })
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setMenu(li, true)
      $('a', li)?.focus()
    }
  })
  li.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(t)
    setMenu(li, true)
  })
  li.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return
    t = setTimeout(() => setMenu(li, false), 160)
  })
  li.addEventListener('focusout', (e) => {
    if (!li.contains(e.relatedTarget)) setMenu(li, false)
  })
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openMenu) {
    const btn = $('[data-trigger]', openMenu)
    setMenu(openMenu, false)
    btn?.focus()
  }
})
document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.contains(e.target)) setMenu(openMenu, false)
})

/* ---------- Mobile sheet: enters from the right, leaves to the right ---------- */
const sheet = $('[data-sheet]')
const toggle = $('[data-mobile-toggle]')
let lastFocus
function openSheet() {
  lastFocus = document.activeElement
  sheet.hidden = false
  requestAnimationFrame(() => sheet.classList.add('open'))
  toggle.setAttribute('aria-expanded', 'true')
  document.documentElement.classList.add('locked')
  setTimeout(() => $('.sheet-close', sheet)?.focus(), 50)
}
function closeSheet() {
  sheet.classList.remove('open')
  toggle.setAttribute('aria-expanded', 'false')
  document.documentElement.classList.remove('locked')
  const done = () => {
    if (!sheet.classList.contains('open')) sheet.hidden = true
  }
  reduceMotion ? done() : setTimeout(done, 380)
  lastFocus?.focus()
}
if (sheet && toggle) {
  toggle.addEventListener('click', () => (sheet.classList.contains('open') ? closeSheet() : openSheet()))
  $$('[data-sheet-close]', sheet).forEach((b) => b.addEventListener('click', closeSheet))
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet()
    if (e.key === 'Tab') {
      const f = $$('a, button, summary', sheet).filter((x) => x.offsetParent !== null)
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault()
        f[0].focus()
      }
    }
  })
  $$('a', sheet).forEach((a) => a.addEventListener('click', () => closeSheet()))

  // Swipe the panel to the right to dismiss; it follows the finger 1:1
  const panel = $('.sheet-panel', sheet)
  let x0 = null,
    dx = 0,
    t0 = 0
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return
    x0 = e.clientX
    dx = 0
    t0 = performance.now()
  })
  panel.addEventListener('pointermove', (e) => {
    if (x0 === null) return
    dx = Math.max(0, e.clientX - x0)
    if (dx > 10) {
      panel.style.transition = 'none'
      panel.style.transform = `translateX(${dx}px)`
    }
  })
  const end = () => {
    if (x0 === null) return
    const v = dx / Math.max(1, performance.now() - t0) // px per ms
    panel.style.transition = ''
    panel.style.transform = ''
    // Decide by projected distance, not where the finger stopped
    if (dx + v * 200 > panel.offsetWidth * 0.35) closeSheet()
    x0 = null
  }
  panel.addEventListener('pointerup', end)
  panel.addEventListener('pointercancel', end)
}

/* ---------- Reveal on scroll ---------- */
const revealEls = $$('[data-reveal]')
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in')
          io.unobserve(en.target)
        }
      })
    },
    {rootMargin: '0px 0px -8% 0px', threshold: 0.08},
  )
  revealEls.forEach((el) => io.observe(el))
} else revealEls.forEach((el) => el.classList.add('in'))

/* ---------- Dialogs (board profiles) ---------- */
$$('[data-dialog]').forEach((btn) => {
  const dlg = document.getElementById(btn.dataset.dialog)
  if (!dlg) return
  btn.addEventListener('click', () => {
    dlg.showModal()
    document.documentElement.classList.add('locked')
  })
  dlg.addEventListener('close', () => document.documentElement.classList.remove('locked'))
  $$('[data-close]', dlg).forEach((c) => c.addEventListener('click', () => dlg.close()))
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close()
  })
})

/* ---------- Simple chip filter (board directory) ---------- */
$$('[data-filter-root]').forEach((root) => {
  const chips = $$('[data-filter]', root)
  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)))
      const f = chip.dataset.filter
      $$('[data-group]', root).forEach((el) => (el.hidden = f !== 'all' && el.dataset.group !== f))
    }),
  )
})

/* ---------- Lightbox ---------- */
let lb
function lightbox() {
  if (lb) return lb
  lb = document.createElement('dialog')
  lb.className = 'lightbox'
  lb.setAttribute('aria-label', 'Image viewer')
  lb.innerHTML = `<figure><img alt=""><figcaption></figcaption></figure>
    <button class="lb-btn lb-prev" aria-label="Previous image"><svg viewBox="0 0 20 20" width="22" height="22"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="lb-btn lb-next" aria-label="Next image"><svg viewBox="0 0 20 20" width="22" height="22"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="lb-btn lb-close" aria-label="Close"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    <p class="lb-count" aria-live="polite"></p>`
  document.body.append(lb)
  lb.addEventListener('click', (e) => {
    if (e.target === lb) lb.close()
  })
  lb.addEventListener('close', () => {
    document.documentElement.classList.remove('locked')
    lb._origin?.focus()
  })
  return lb
}
$$('[data-gallery]').forEach((g) => {
  const items = $$('.g-open:not([tabindex="-1"])', g)
  let i = 0
  const show = (n) => {
    const d = lightbox()
    i = (n + items.length) % items.length
    const b = items[i]
    const im = $('img', d)
    im.src = b.dataset.full
    if (b.dataset.srcset) {
      im.srcset = b.dataset.srcset
      im.sizes = '100vw'
    } else im.removeAttribute('srcset')
    im.alt = b.dataset.alt || ''
    $('figcaption', d).textContent = b.dataset.caption || ''
    $('.lb-count', d).textContent = items.length > 1 ? `${i + 1} of ${items.length}` : ''
    $('.lb-prev', d).hidden = $('.lb-next', d).hidden = items.length < 2
  }
  items.forEach((b, n) =>
    b.addEventListener('click', () => {
      const d = lightbox()
      d._origin = b
      d.onkeydown = (e) => {
        if (e.key === 'ArrowRight') show(i + 1)
        if (e.key === 'ArrowLeft') show(i - 1)
      }
      $('.lb-prev', d).onclick = () => show(i - 1)
      $('.lb-next', d).onclick = () => show(i + 1)
      $('.lb-close', d).onclick = () => d.close()
      // swipe between photos
      let sx = null
      d.onpointerdown = (e) => (sx = e.clientX)
      d.onpointerup = (e) => {
        if (sx === null) return
        const dx = e.clientX - sx
        if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1))
        sx = null
      }
      show(n)
      d.showModal()
      document.documentElement.classList.add('locked')
    }),
  )
})

/* ---------- Civic Action Center ---------- */
const tool = $('[data-actions]')
if (tool) {
  const cards = $$('.action', tool)
  const goals = $$('[data-goal].goal', tool)
  const search = $('[data-search]', tool)
  const allBtn = $('[data-all]', tool)
  const count = $('[data-count]', tool)
  const list = $('[data-plan-list]', tool)
  const empty = $('[data-plan-empty]', tool)
  const dl = $('[data-plan-download]', tool)
  const clear = $('[data-plan-clear]', tool)
  let goal = goals[0]?.dataset.goal
  let showAll = false
  let plan = (store.get('sbwpc-plan') || []).filter((id) => cards.some((c) => c.dataset.id === id))

  const apply = () => {
    const q = (search.value || '').trim().toLowerCase()
    let n = 0
    cards.forEach((c) => {
      const ok = (showAll || q || c.dataset.goal === goal) && (!q || c.dataset.text.includes(q))
      c.hidden = !ok
      if (ok) n++
    })
    count.textContent = `Showing ${n} of ${cards.length} actions`
    allBtn.setAttribute('aria-pressed', String(showAll))
  }
  goals.forEach((g) =>
    g.addEventListener('click', () => {
      goal = g.dataset.goal
      showAll = false
      goals.forEach((x) => x.setAttribute('aria-selected', String(x === g)))
      apply()
    }),
  )
  allBtn.addEventListener('click', () => {
    showAll = !showAll
    apply()
  })
  search.addEventListener('input', apply)

  const renderPlan = () => {
    list.innerHTML = ''
    plan.forEach((id) => {
      const c = cards.find((x) => x.dataset.id === id)
      if (!c) return
      const li = document.createElement('li')
      const a = document.createElement(c.dataset.url ? 'a' : 'span')
      a.textContent = c.dataset.title
      if (c.dataset.url) a.href = c.dataset.url
      const rm = document.createElement('button')
      rm.className = 'plan-rm'
      rm.textContent = 'Remove'
      rm.addEventListener('click', () => toggle(id))
      li.append(a, rm)
      list.append(li)
    })
    empty.hidden = plan.length > 0
    dl.disabled = clear.disabled = plan.length === 0
    cards.forEach((c) => {
      const b = $('[data-add]', c)
      const on = plan.includes(c.dataset.id)
      b.setAttribute('aria-pressed', String(on))
      b.textContent = on ? 'In your plan' : plan.length >= 3 ? 'Plan is full' : 'Add to plan'
      b.disabled = !on && plan.length >= 3
    })
    store.set('sbwpc-plan', plan)
  }
  const toggle = (id) => {
    plan = plan.includes(id) ? plan.filter((x) => x !== id) : plan.length < 3 ? [...plan, id] : plan
    renderPlan()
  }
  cards.forEach((c) => $('[data-add]', c).addEventListener('click', () => toggle(c.dataset.id)))
  clear.addEventListener('click', () => {
    plan = []
    renderPlan()
  })
  dl.addEventListener('click', () => {
    const lines = ['My SBWPC three-action plan', '']
    plan.forEach((id, n) => {
      const c = cards.find((x) => x.dataset.id === id)
      if (c) lines.push(`${n + 1}. ${c.dataset.title}${c.dataset.url ? ' - ' + new URL(c.dataset.url, location.href).href : ''}`)
    })
    lines.push('', 'Santa Barbara Women\'s Political Committee · sbwpc.org')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/plain'}))
    a.download = 'sbwpc-action-plan.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })
  apply()
  renderPlan()
}

/* ---------- Boards and commissions filter ---------- */
const opps = $('[data-opps]')
if (opps) {
  const chips = $$('[data-j].chip', opps)
  const sel = $('[data-issue]', opps)
  const cards = $$('li[data-j]', opps)
  const count = $('[data-count]', opps)
  let j = 'all'
  const apply = () => {
    let n = 0
    cards.forEach((c) => {
      const ok = (j === 'all' || c.dataset.j === j) && (sel.value === 'all' || c.dataset.issues.split(' ').includes(sel.value))
      c.hidden = !ok
      if (ok) n++
    })
    count.textContent = `${n} ${n === 1 ? 'opportunity' : 'opportunities'}`
  }
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      j = c.dataset.j
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)))
      apply()
    }),
  )
  sel.addEventListener('change', apply)
  apply()
}

/* ---------- YouTube: load the player only when asked ---------- */
$$('.yt').forEach((b) =>
  b.addEventListener('click', () => {
    const f = document.createElement('iframe')
    f.src = b.dataset.yt
    f.title = b.dataset.title || 'Video'
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    f.allowFullscreen = true
    f.referrerPolicy = 'strict-origin-when-cross-origin'
    const wrap = document.createElement('div')
    wrap.className = 'embed ratio-16x9'
    wrap.append(f)
    b.replaceWith(wrap)
    f.focus()
  }),
)

/* ---------- Photo strip: pause while a photo has keyboard focus ---------- */
$$('.g-band').forEach((band) => {
  band.addEventListener('focusin', () => band.classList.add('paused'))
  band.addEventListener('focusout', () => band.classList.remove('paused'))
})

// Email links: many visitors have no desktop mail app set up, so a mailto link does nothing.
// Offer Gmail, Outlook, the default mail app, or copying the address.
;(() => {
  let menu = null
  let lastLink = null
  const close = () => {
    if (!menu) return
    menu.remove()
    menu = null
    lastLink?.focus()
  }
  const open = (a) => {
    close()
    lastLink = a
    const u = new URL(a.href)
    const to = decodeURIComponent(u.pathname)
    const subject = u.searchParams.get('subject') || ''
    const enc = encodeURIComponent
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}${subject ? `&su=${enc(subject)}` : ''}`
    const outlook = `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}${subject ? `&subject=${enc(subject)}` : ''}`
    menu = document.createElement('div')
    menu.className = 'mail-menu'
    menu.setAttribute('role', 'dialog')
    menu.setAttribute('aria-label', `Email ${to}`)
    menu.innerHTML = `
      <p class="mail-menu-to">${to}</p>
      <a class="mail-opt" href="${gmail}" target="_blank" rel="noopener">Open in Gmail</a>
      <a class="mail-opt" href="${outlook}" target="_blank" rel="noopener">Open in Outlook</a>
      <a class="mail-opt" href="${a.href}" data-native>Use my email app</a>
      <button class="mail-opt" type="button" data-copy>Copy address</button>`
    document.body.appendChild(menu)
    const r = a.getBoundingClientRect()
    const w = menu.offsetWidth
    const left = Math.min(Math.max(12, r.left + scrollX), scrollX + document.documentElement.clientWidth - w - 12)
    let top = r.bottom + scrollY + 8
    if (r.bottom + menu.offsetHeight + 16 > innerHeight && r.top > menu.offsetHeight + 16) top = r.top + scrollY - menu.offsetHeight - 8
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    menu.querySelector('.mail-opt').focus()
    menu.addEventListener('click', (e) => {
      const t = e.target.closest('.mail-opt')
      if (!t) return
      if (t.hasAttribute('data-copy')) {
        e.preventDefault()
        const done = () => { t.textContent = 'Copied' ; setTimeout(close, 900) }
        navigator.clipboard?.writeText(to).then(done, () => { t.textContent = to })
        return
      }
      if (t.hasAttribute('data-native')) { e.preventDefault(); location.href = a.href }
      setTimeout(close, 50)
    })
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('.mail-opt')]
      const i = items.indexOf(document.activeElement)
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus() }
      else if (e.key === 'Tab' && ((e.shiftKey && i === 0) || (!e.shiftKey && i === items.length - 1))) { e.preventDefault(); items[e.shiftKey ? items.length - 1 : 0].focus() }
    })
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="mailto:"]')
    if (a && !a.closest('.mail-menu')) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return
      e.preventDefault()
      if (menu && lastLink === a) close()
      else open(a)
      return
    }
    if (menu && !e.target.closest('.mail-menu')) { menu.remove(); menu = null }
  })
  addEventListener('resize', () => { if (menu) { menu.remove(); menu = null } })
})()
