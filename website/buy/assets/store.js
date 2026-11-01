(() => {
  'use strict';

  const ROUTES = Object.freeze({
    '/creatoros/': Object.freeze({ slug: 'creatoros', configUrl: '/products/creatoros.json' }),
    '/moving/': Object.freeze({ slug: 'moving', configUrl: '/products/moving.json' })
  });
  const PRODUCT_SLUGS = Object.freeze(['creatoros', 'moving']);
  const $ = selector => document.querySelector(selector);
  const normalize = value => String(value || '').trim();
  const text = (selector, value) => { const node = $(selector); if (node) node.textContent = normalize(value); };
  const create = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = normalize(value);
    return node;
  };
  const setStatus = (node, message, type = '') => {
    node.textContent = message;
    node.classList.add('status');
    node.classList.remove('error', 'warn', 'success');
    if (type) node.classList.add(type);
  };
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const idempotencyKey = prefix => {
    const randomPart = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${randomPart}`;
  };
  const fetchWithRetry = async (url, options, attempts = 3) => {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, options);
        if (![502, 503, 504].includes(response.status)) return response;
        lastError = new TypeError('服务暂时不可用');
        if (attempt === attempts - 1) throw lastError;
      } catch (error) {
        lastError = error;
        if (attempt === attempts - 1) throw error;
      }
      await wait(600 * (attempt + 1));
    }
    throw lastError || new Error('网络连接中断');
  };
  const safeHttpsUrl = value => {
    try {
      const url = new URL(normalize(value));
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return url;
    } catch (_) {
      return null;
    }
  };
  const failClosed = () => {
    const main = create('main', 'fail-closed');
    const section = create('section', 'section');
    const wrap = create('div', 'wrap');
    const heading = create('h1', '', '购买站暂时不可用');
    const copy = create('p', '', '页面配置未能安全加载，请稍后刷新或联系官方客服。');
    wrap.append(heading, copy);
    section.append(wrap);
    main.append(section);
    document.body.replaceChildren(main);
    document.title = '购买站暂时不可用';
  };
  const resolveRoute = () => {
    if (ROUTES[window.location.pathname]) return ROUTES[window.location.pathname];
    const isLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
    if (isLocal && ['/index.html', '/'].includes(window.location.pathname)) {
      const preview = new URLSearchParams(window.location.search).get('preview');
      return ROUTES[`/${preview}/`] || null;
    }
    return null;
  };
  const validateConfig = (config, route) => {
    if (!config || config.schemaVersion !== 1 || config.slug !== route.slug) return false;
    const otherSlugs = PRODUCT_SLUGS.filter(slug => slug !== route.slug);
    const commerce = config.commerce || {};
    const endpoints = [commerce.checkoutIntentEndpoint, commerce.redemptionEndpoint, commerce.redemptionStatusEndpoint].filter(Boolean);
    if (endpoints.some(endpoint => !normalize(endpoint).startsWith(`/api/store/${route.slug}/`))) return false;
    if (otherSlugs.some(slug => endpoints.some(endpoint => normalize(endpoint).includes(`/store/${slug}/`)))) return false;
    if (commerce.ready && (!endpoints[0] || !commerce.redemptionEndpoint || !Array.isArray(commerce.plans) || !commerce.plans.length)) return false;
    if (!Array.isArray(config.downloads) || !Array.isArray(config.support?.contacts)) return false;
    for (const download of config.downloads) {
      if (download.href && !safeHttpsUrl(download.href)) return false;
    }
    return true;
  };

  const init = async () => {
    const route = resolveRoute();
    if (!route) return failClosed();

    let config;
    try {
      const response = await fetch(route.configUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('config');
      config = await response.json();
    } catch (_) {
      return failClosed();
    }
    if (!validateConfig(config, route)) return failClosed();

    document.body.classList.remove('loading');
    document.body.classList.add(`product-${config.slug}`);
    $('#app').setAttribute('aria-busy', 'false');
    document.title = config.seo.title;
    $('meta[name="description"]').setAttribute('content', config.seo.description);

    renderIdentity(config);
    renderProduct(config);
    renderCommerce(config);
    renderDownloads(config);
    renderFaq(config);
    renderSupport(config);
    bindLightbox();
    bindReveal();
  };

  const renderIdentity = config => {
    text('#brand-mark', config.brand.mark);
    text('#footer-mark', config.brand.mark);
    text('#brand-name', config.brand.name);
    text('#footer-brand', config.brand.name);
    text('#brand-doc', config.brand.documentNo);
    text('#copyright', `© 2026 ${config.brand.name}`);
    const productSite = $('#product-site');
    const productSiteUrl = safeHttpsUrl(config.brand.productSiteUrl);
    if (productSiteUrl) productSite.href = productSiteUrl.href;
    else productSite.hidden = true;
  };

  const renderProduct = config => {
    text('#hero-kicker', config.hero.kicker);
    text('#hero-title', config.hero.title);
    text('#hero-subtitle', config.hero.subtitle);
    const availablePlans = config.commerce.plans.filter(plan => plan?.retailSku && plan.priceLabel);
    const purchaseNote = config.commerce.ready && availablePlans.length
      ? `${availablePlans.map(plan => `${plan.shortTitle || plan.title} ${plan.priceLabel}`).join(' · ')} · 推荐人选填，留空不影响购买或兑换`
      : config.hero.note;
    text('#hero-note', purchaseNote);
    text('#hero-primary', config.hero.primaryLabel);
    text('#hero-secondary', config.hero.secondaryLabel);
    text('#hero-shot-label', config.hero.image.windowLabel);
    text('#hero-shot-caption', config.hero.image.caption);
    const heroImage = $('#hero-shot');
    heroImage.src = config.hero.image.src;
    heroImage.alt = config.hero.image.alt;

    const stats = $('#stats');
    config.stats.forEach(item => {
      const node = create('div', 'spec-item');
      node.append(create('strong', '', item.value), create('span', '', item.label));
      stats.append(node);
    });

    text('#workflow-title', config.workflow.title);
    text('#workflow-subtitle', config.workflow.subtitle);
    const workflowCards = $('#workflow-cards');
    config.workflow.cards.forEach((item, index) => {
      const card = create('article', 'flow-card reveal');
      card.append(create('span', 'flow-index', `0${index + 1}`), create('h3', '', item.title), create('p', '', item.copy));
      workflowCards.append(card);
    });

    text('#details-title', config.details.title);
    text('#details-subtitle', config.details.subtitle);
    const table = $('#feature-table');
    config.details.features.forEach(item => {
      const row = create('div', 'feature-row');
      const value = create('div', 'feature-value');
      value.append(create('h3', '', item.title), create('p', '', item.copy));
      row.append(create('div', 'feature-key', item.key), value);
      table.append(row);
    });
    const gallery = $('#gallery');
    config.details.gallery.forEach(item => {
      const figure = create('figure', 'reveal');
      const image = create('img', 'zoomable');
      image.src = item.src;
      image.alt = item.alt;
      image.loading = 'lazy';
      figure.append(image, create('figcaption', '', item.caption));
      gallery.append(figure);
    });
  };

  const renderCommerce = config => {
    const commerce = config.commerce;
    text('#purchase-title', commerce.title);
    text('#purchase-subtitle', commerce.subtitle);
    text('#purchase-eyebrow', `${config.brand.name} 正式版`);
    text('#steps-title', commerce.stepsTitle);
    text('#steps-copy', commerce.stepsCopy);
    text('#referrer-intro', commerce.referrerIntro);
    const referrerNote = normalize(commerce.referrerNote);
    text('#referrer-note', referrerNote === '填写推荐人微信号，购买所选套餐可获赠一定额度的免费 Token。' ? '推荐人选填，用于记录购买来源；AI 额度以套餐权益和实际账户为准。' : referrerNote);
    commerce.included.forEach(item => $('#included').append(create('li', '', item)));

    const plans = commerce.plans.filter(plan => plan && plan.retailSku);
    let selectedPlan = plans.find(plan => plan.retailSku === commerce.defaultRetailSku) || plans[0] || null;
    let salesSource = null;
    let sourcePending = false;
    let sourceBlocked = false;
    const sourceToken = new URLSearchParams(window.location.hash.slice(1)).get('s') || '';
    let activeSourceToken = sourceToken;
    window.addEventListener('hashchange', () => {
      const nextSource = new URLSearchParams(window.location.hash.slice(1)).get('s') || '';
      if (nextSource !== activeSourceToken) window.location.reload();
    });
    // 页内定位不能覆盖 #s= 来源；刷新仍须向服务端核验同一链接。
    document.addEventListener('click', event => {
      if (!activeSourceToken || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const target = document.getElementById(anchor.getAttribute('href').slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const picker = $('#plan-picker');
    const checkoutPrice = $('#checkout-price');
    const referrerInput = $('#referrer-wechat');
    const referrerFeedback = $('#referrer-feedback');
    let hadReferrer = false;
    const replayAnimation = (node, className) => {
      node.classList.remove(className);
      void node.offsetWidth;
      node.classList.add(className);
    };
    const sourceFeedback = create('p', 'status sales-source-feedback');
    sourceFeedback.setAttribute('role', 'status');
    sourceFeedback.setAttribute('aria-live', 'polite');
    sourceFeedback.hidden = true;
    const clearSourceButton = create('button', 'button button-secondary sales-source-clear', '移除链接来源，继续官方选购');
    clearSourceButton.type = 'button';
    clearSourceButton.hidden = true;
    referrerFeedback.after(sourceFeedback, clearSourceButton);
    const detachSource = message => {
      activeSourceToken = '';
      salesSource = null;
      sourcePending = false;
      sourceBlocked = false;
      const url = new URL(window.location.href);
      url.hash = 'purchase';
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      setStatus(sourceFeedback, message, 'warn');
      sourceFeedback.hidden = false;
      clearSourceButton.hidden = true;
      $('#checkout-button').disabled = !commerce.ready;
    };
    clearSourceButton.addEventListener('click', () => {
      detachSource('链接推荐来源已移除。请重新确认推荐人和套餐，再继续官方选购。');
      referrerInput.value = '';
      updateReferrerFeedback();
    });
    const updateReferrerFeedback = () => {
      if (!referrerFeedback) return;
      const hasReferrer = Boolean(commerce.ready && selectedPlan && normalize(referrerInput.value));
      referrerFeedback.hidden = !hasReferrer;
      if (hasReferrer && selectedPlan) {
        referrerFeedback.textContent = `推荐人已填写，提交购买时会一并记录；当前购买价 ${selectedPlan.priceLabel}。`;
        if (!hadReferrer) replayAnimation(referrerFeedback, 'referrer-enter');
      }
      hadReferrer = hasReferrer;
    };
    const selectPlan = plan => {
      const changed = selectedPlan?.retailSku !== plan.retailSku;
      if (salesSource && salesSource.retailSku !== plan.retailSku) detachSource('你已更换套餐，原链接来源已移除；当前填写的推荐人将按手填来源记录。请确认后继续。');
      selectedPlan = plan;
      $('#retail-sku').value = plan.retailSku;
      text('#checkout-button', plan.buttonLabel || `购买${plan.shortTitle} · ${plan.priceLabel}`);
      // 价格取已选套餐的明确报价；推荐人是来源记录，不是折扣前置条件。
      const activationNote = normalize(plan.activationNote).replace('填写推荐人微信号，', '');
      text('#selected-plan-copy', `当前购买价 ${plan.priceLabel}，推荐人选填，留空不影响购买或兑换。${activationNote}`);
      if (checkoutPrice) {
        checkoutPrice.hidden = false;
        text('#checkout-price-plan', plan.shortTitle);
        text('#checkout-price-value', plan.priceLabel);
        text('#checkout-original-price', plan.originalPriceLabel ? `原价 ${plan.originalPriceLabel}` : '');
        if (changed) replayAnimation(checkoutPrice, 'price-switch');
      }
      updateReferrerFeedback();
      picker.querySelectorAll('.plan-option').forEach(button => {
        const selected = button.dataset.retailSku === plan.retailSku;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    };
    plans.forEach(plan => {
      const button = create('button', 'plan-option');
      button.type = 'button';
      button.dataset.retailSku = plan.retailSku;
      button.setAttribute('aria-pressed', 'false');
      const head = create('span', 'plan-option-head');
      head.append(create('span', 'plan-option-title', plan.title), create('span', 'plan-option-price', plan.priceLabel));
      const priceNote = `${plan.originalPriceLabel ? `原价 ${plan.originalPriceLabel} · ` : ''}当前购买价 ${plan.priceLabel} · 推荐人选填`;
      button.append(head, create('span', 'plan-option-note', priceNote), create('span', 'plan-option-summary', plan.summary));
      button.addEventListener('click', () => selectPlan(plan));
      picker.append(button);
    });
    if (selectedPlan) selectPlan(selectedPlan);
    referrerInput.addEventListener('input', () => {
      if (salesSource && normalize(referrerInput.value) !== salesSource.wechat) detachSource('你已更正推荐人，原链接来源已移除；新的推荐人将按手填来源记录。请确认后继续。');
      updateReferrerFeedback();
    });

    const checkoutButton = $('#checkout-button');
    const resolveSalesSource = async () => {
      if (!sourceToken) return;
      sourcePending = true;
      sourceBlocked = false;
      checkoutButton.disabled = true;
      referrerInput.readOnly = true;
      sourceFeedback.hidden = false;
      setStatus(sourceFeedback, '正在确认产品链接与推荐人…');
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(sourceToken) || !commerce.ready) throw new Error('unavailable');
        const response = await fetchWithRetry(`/api/store/${config.slug}/sales-link/resolve`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey(`${config.slug}-sales-source`) },
          body: JSON.stringify({ salesLinkToken: sourceToken })
        });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        const plan = plans.find(item => item.retailSku === data.retailSku);
        const wechat = normalize(data.referrerWechat);
        if (data.storeSlug !== config.slug || !plan || data.currency !== 'CNY' || data.priceCents !== plan.priceCents || !wechat || wechat.length > 80 || /[\s\u0000-\u001f\u007f]/u.test(wechat)) throw new Error('selection');
        salesSource = { token: sourceToken, wechat, retailSku: data.retailSku };
        referrerInput.value = wechat;
        selectPlan(plan);
        setStatus(sourceFeedback, `来自 ${wechat} 的产品链接，推荐人已自动带入。请确认套餐与价格后购买。`, 'success');
      } catch (error) {
        sourceBlocked = true;
        clearSourceButton.hidden = false;
        setStatus(sourceFeedback, error.message === 'selection'
          ? '链接套餐或价格尚未与本购买站一致，请向代理获取适用链接；也可明确移除来源继续官方选购。'
          : '链接已失效、商品未开放或暂时无法确认。可以刷新重试、向代理获取新链接，或移除来源继续官方选购。', 'warn');
      } finally {
        sourcePending = false;
        referrerInput.readOnly = false;
        checkoutButton.disabled = !commerce.ready || sourceBlocked;
      }
    };
    resolveSalesSource();
    const redeemButton = $('#redeem-button');
    const channelState = $('#channel-state');
    if (!commerce.ready) {
      $('#empty-plan').hidden = false;
      text('#empty-plan-title', commerce.unavailableTitle);
      text('#empty-plan-copy', commerce.unavailableCopy);
      picker.hidden = true;
      checkoutButton.disabled = true;
      redeemButton.disabled = true;
      $('#purchase-code').disabled = true;
      text('#checkout-button', commerce.unavailableButtonLabel);
      channelState.hidden = false;
      channelState.textContent = commerce.unavailableCopy;
    }

    const redeemPanel = $('#redeem-panel');
    $('#show-redeem').addEventListener('click', () => {
      redeemPanel.classList.add('open');
      if (commerce.ready) $('#purchase-code').focus();
      else setStatus($('#redeem-status'), commerce.redemptionUnavailableCopy, 'warn');
    });

    const reminder = $('#checkout-reminder');
    let pendingCheckout = null;
    reminder.addEventListener('close', () => { pendingCheckout = null; });
    $('#checkout-reminder-cancel').addEventListener('click', () => reminder.close());
    const startCheckout = async ({ plan, referrerWechat, salesLinkToken }) => {
      const status = $('#checkout-status');
      const retailSku = plan.retailSku;
      const checkoutWindow = window.open('about:blank', '_blank');
      if (!checkoutWindow) return setStatus(status, '浏览器阻止了新页签，请允许本站打开新页签后再试。', 'error');
      checkoutWindow.opener = null;
      checkoutButton.disabled = true;
      setStatus(status, '正在创建购买请求…');
      const requestKey = idempotencyKey(`${config.slug}-intent`);
      try {
        const payload = { referrerWechat };
        if (salesLinkToken) payload.salesLinkToken = salesLinkToken;
        payload[commerce.retailSkuRequestField || 'retailSku'] = retailSku;
        const response = await fetchWithRetry(commerce.checkoutIntentEndpoint, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('intent');
        const data = await response.json();
        const checkoutUrl = safeHttpsUrl(data.checkoutUrl);
        const checkoutHostAllowed = checkoutUrl && commerce.allowedCheckoutHosts.includes(checkoutUrl.hostname);
        if (!checkoutHostAllowed || data.retailSku !== retailSku || data.priceCents !== plan.priceCents || data.currency !== 'CNY') throw new Error('mismatch');
        if (checkoutWindow.closed) throw new Error('closed');
        checkoutWindow.location.replace(checkoutUrl.href);
        setStatus(status, `${plan.title}付款页已在新页签打开。拿到购买码后请回到本页兑换正式激活码。`, 'success');
      } catch (_) {
        if (!checkoutWindow.closed) checkoutWindow.close();
        setStatus(status, '暂时无法进入付款，请稍后重试或联系客服。', 'error');
      } finally {
        checkoutButton.disabled = false;
      }
    };
    $('#checkout-reminder-continue').addEventListener('click', () => {
      if (!pendingCheckout) return;
      const checkout = pendingCheckout;
      pendingCheckout = null;
      reminder.close();
      startCheckout(checkout);
    });
    $('#checkout-form').addEventListener('submit', event => {
      event.preventDefault();
      const status = $('#checkout-status');
      if (!commerce.ready || !commerce.checkoutIntentEndpoint) return setStatus(status, commerce.unavailableCopy, 'warn');
      if (sourcePending || sourceBlocked) return setStatus(status, '请先确认链接来源，或明确移除来源后继续。', 'warn');
      if (!selectedPlan?.retailSku) return setStatus(status, '套餐信息加载失败，请刷新页面后重试。', 'error');
      pendingCheckout = {
        plan: selectedPlan,
        referrerWechat: normalize(event.currentTarget.elements.referrerWechat.value),
        salesLinkToken: salesSource && salesSource.retailSku === selectedPlan.retailSku && salesSource.wechat === normalize(referrerInput.value) ? salesSource.token : null
      };
      reminder.showModal();
    });

    let pollTimer = null;
    let pendingRedemption = null;
    const showDelivery = data => {
      text('#activation-code', data.activationCode);
      text('#delivery-title', `兑换成功，${config.brand.name} 正式激活码`);
      text('#delivery-note', `请妥善保存。进入 ${config.brand.name} 后使用此码完成激活。`);
      const guide = commerce.postRedemptionGuide;
      const guideUrl = safeHttpsUrl(guide?.url);
      const showGuide = data.retailSku === guide?.retailSku && guideUrl;
      $('#delivery-guide').hidden = !showGuide;
      if (showGuide) {
        text('#delivery-guide-title', guide.title);
        text('#delivery-guide-copy', guide.copy);
        const guideLink = $('#delivery-guide-link');
        guideLink.href = guideUrl.href;
        guideLink.textContent = guide.buttonLabel;
      }
      text('#delivery-support-title', `添加 ${config.brand.name} 客服微信`);
      text('#delivery-support-copy', `添加后可获取安装、激活与使用帮助，请备注「已购 ${config.brand.name}」。`);
      const primarySupport = config.support.contacts[0];
      const deliveryButton = $('#delivery-support-button');
      deliveryButton.textContent = `复制微信号 ${primarySupport.value}`;
      deliveryButton.dataset.copy = primarySupport.value;
      $('#delivery').classList.add('open');
      setStatus($('#redeem-status'), '兑换成功。请复制并妥善保存正式激活码。', 'success');
    };
    const pollRedemption = async redemptionId => {
      if (!commerce.redemptionStatusEndpoint) return;
      try {
        const url = commerce.redemptionStatusEndpoint.replace('{id}', encodeURIComponent(redemptionId));
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error('status');
        const data = await response.json();
        if (data.status === 'fulfilled' && data.activationCode) {
          clearTimeout(pollTimer);
          showDelivery(data);
          redeemButton.disabled = false;
          return;
        }
        if (data.status === 'failed') throw new Error('failed');
        pollTimer = setTimeout(() => pollRedemption(redemptionId), 1800);
      } catch (_) {
        setStatus($('#redeem-status'), '交付状态暂时无法确认。请保留购买码，稍后重试。', 'error');
        redeemButton.disabled = false;
      }
    };

    $('#redeem-form').addEventListener('submit', async event => {
      event.preventDefault();
      const status = $('#redeem-status');
      const purchaseCode = normalize(event.currentTarget.elements.purchaseCode.value);
      if (!commerce.ready || !commerce.redemptionEndpoint) return setStatus(status, commerce.redemptionUnavailableCopy, 'warn');
      if (!purchaseCode) return setStatus(status, '请输入链动小铺购买码。', 'error');
      redeemButton.disabled = true;
      $('#delivery').classList.remove('open');
      setStatus(status, '正在核验购买码并申请正式激活码…');
      const requestKey = pendingRedemption && pendingRedemption.purchaseCode === purchaseCode
        ? pendingRedemption.requestKey
        : idempotencyKey(`${config.slug}-redeem`);
      pendingRedemption = { purchaseCode, requestKey };
      try {
        const response = await fetchWithRetry(commerce.redemptionEndpoint, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
          body: JSON.stringify({ purchaseCode })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('invalid');
        if (data.status === 'fulfilled' && data.activationCode) {
          pendingRedemption = null;
          showDelivery(data);
          redeemButton.disabled = false;
          return;
        }
        if (data.redemptionId) {
          setStatus(status, '购买码已通过，正在生成正式激活码…');
          pollRedemption(data.redemptionId);
          return;
        }
        throw new Error('incomplete');
      } catch (error) {
        if (error instanceof TypeError) {
          setStatus(status, '网络连接暂时中断，请保持页面不关闭并再次点击兑换，系统会继续核对同一笔请求。', 'error');
        } else {
          pendingRedemption = null;
          setStatus(status, '购买码无效或暂不可用，请核对后重试；如已付款请联系客服。', 'error');
        }
        redeemButton.disabled = false;
      }
    });

    $('#copy-code').addEventListener('click', async event => {
      const codeNode = $('#activation-code');
      const selection = window.getSelection();
      let selected = false;
      let copied = false;
      try {
        if (selection && codeNode.textContent) {
          const range = document.createRange();
          range.selectNodeContents(codeNode);
          selection.removeAllRanges();
          selection.addRange(range);
          selected = true;
          copied = document.execCommand('copy');
        }
      } catch (_) { /* Try the Clipboard API below. */ }
      if (!copied) try {
        await navigator.clipboard.writeText(codeNode.textContent);
        copied = true;
      } catch (_) { /* Keep the code selected for manual copying. */ }
      if (copied) {
        event.currentTarget.textContent = '已复制';
      } else if (selected) {
        event.currentTarget.textContent = '已选中';
        setStatus($('#redeem-status'), '浏览器未开放自动复制，激活码已选中，请按 ⌘C（Mac）或 Ctrl+C（Windows）复制。', 'warn');
      } else {
        setStatus($('#redeem-status'), '无法自动复制，请手动选中激活码后复制。', 'warn');
      }
    });
  };

  const renderDownloads = config => {
    text('#download-subtitle', config.downloadSection.subtitle);
    text('#download-note', config.downloadSection.note);
    const grid = $('#download-grid');
    config.downloads.forEach(item => {
      const card = create('article', 'download-card reveal');
      card.append(create('div', 'platform', item.platform), create('h3', '', item.title), create('p', '', item.copy));
      const href = safeHttpsUrl(item.href);
      if (href) {
        const link = create('a', 'button button-secondary', item.buttonLabel || '前往下载');
        link.href = href.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(link);
      } else {
        const button = create('button', 'button button-secondary', item.unavailableLabel || '正式下载准备中');
        button.type = 'button';
        button.disabled = true;
        card.append(button);
      }
      grid.append(card);
    });
  };

  const renderFaq = config => {
    const list = $('#faq-list');
    config.faq.forEach(item => {
      const details = create('details');
      details.append(create('summary', '', item.question), create('p', '', item.answer));
      list.append(details);
    });
  };

  const renderSupport = config => {
    text('#support-subtitle', config.support.subtitle);
    text('#support-title', config.support.title);
    text('#support-lead', config.support.lead);
    const qr = $('#support-qr');
    qr.src = config.support.qr;
    qr.alt = `${config.brand.name} 客服微信二维码`;
    const list = $('#support-list');
    config.support.contacts.forEach(item => {
      const row = create('div', 'support-row');
      const button = create('button', 'support-copy', '复制');
      button.type = 'button';
      button.dataset.copy = item.value;
      row.append(create('span', 'support-label', item.label), create('span', 'support-value', item.value), button);
      list.append(row);
    });
    document.querySelectorAll('.support-copy').forEach(button => button.addEventListener('click', async event => {
      const original = event.currentTarget.textContent;
      try {
        await navigator.clipboard.writeText(event.currentTarget.dataset.copy || '');
        event.currentTarget.textContent = '已复制';
        setTimeout(() => { event.currentTarget.textContent = original; }, 1500);
      } catch (_) {
        event.currentTarget.textContent = '请手动复制';
      }
    }));
  };

  const bindLightbox = () => {
    const lightbox = $('#lightbox');
    const lightboxImage = $('#lightbox-image');
    const close = () => { lightbox.classList.remove('open'); lightboxImage.src = ''; };
    document.querySelectorAll('.zoomable').forEach(image => image.addEventListener('click', () => {
      lightboxImage.src = image.src;
      lightboxImage.alt = image.alt;
      lightbox.classList.add('open');
      $('#lightbox-close').focus();
    }));
    $('#lightbox-close').addEventListener('click', close);
    lightbox.addEventListener('click', event => { if (event.target === lightbox) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  };

  const bindReveal = () => {
    const nodes = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      }), { threshold: .08 });
      nodes.forEach(node => observer.observe(node));
    } else nodes.forEach(node => node.classList.add('visible'));
  };

  init();
})();
