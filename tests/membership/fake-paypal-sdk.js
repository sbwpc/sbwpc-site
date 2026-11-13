// Test-only stand-in for PayPal's browser script. Draws labelled buttons and walks the same callbacks
// PayPal's real buttons call, so the page logic can be exercised without a PayPal account.
(() => {
  const ns = document.currentScript.dataset.namespace || 'paypal'
  const recurring = /intent=subscription/.test(document.currentScript.src)
  const mk = (label, bg, fg) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = 'sim-pay'; b.style.cssText = `display:block;width:100%;height:48px;margin:0 0 10px;border:0;border-radius:4px;background:${bg};color:${fg};font:600 17px/1 Outfit,Arial,sans-serif;cursor:pointer`; return b }
  window[ns] = {
    Buttons(opts) {
      return {
        close() {},
        async render(el) {
          const go = async () => {
            let allowed = true
            await opts.onClick({}, {resolve: () => { allowed = true }, reject: () => { allowed = false }})
            if (!allowed) return
            try {
              if (window.__simCancel) { window.__simCancel = false; if (recurring) await opts.createSubscription(); else await opts.createOrder(); return opts.onCancel() }
              if (recurring) { const id = await opts.createSubscription(); await opts.onApprove({subscriptionID: id}) }
              else { const id = await opts.createOrder(); await opts.onApprove({orderID: id}) }
            } catch (e) { opts.onError(e) }
          }
          const a = mk(recurring ? 'PayPal Subscribe (simulated)' : 'PayPal (simulated)', '#ffc439', '#111')
          a.addEventListener('click', go)
          el.appendChild(a)
          if (!recurring) { const c = mk('Debit or Credit Card (simulated)', '#2c2e2f', '#fff'); c.addEventListener('click', go); el.appendChild(c) }
        },
      }
    },
    Applepay() {
      return {
        config: async () => ({isEligible: true, countryCode: 'US', merchantCapabilities: ['supports3DS'], supportedNetworks: ['visa', 'masterCard']}),
        validateMerchant: async () => ({merchantSession: {}}),
        confirmOrder: async ({orderId}) => { await fetch('http://localhost:54331/_test/apple/' + orderId).catch(() => {}); return {} },
      }
    },
  }
})()
