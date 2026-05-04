(function() {
  // 1. Basic configuration
  const scriptTag = document.currentScript || document.querySelector('script[data-site-id]');
  if (!scriptTag) return;
  
  const site_id = scriptTag.getAttribute('data-site-id');
  const api_url = 'https://alternytics.vercel.app/api/collect'; 
  
  let pageview_id = null;
  let startTime = Date.now();
  let maxScroll = 0;
  let lastPage = window.location.pathname;

  // 2. Extraction
  const urlParams = new URLSearchParams(window.location.search);
  const getUTM = (param) => urlParams.get(param) || null;

  // 3. Sending payload
  const sendPayload = async (data) => {
    try {
      const response = await fetch(api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id, ...data }),
        keepalive: true
      });
      return await response.json();
    } catch (e) { /* Failure */ }
  };

  // 4. Init Pageview
  const initPageview = async () => {
    const client_bot_reason = detectClientBot();

    const current_exec_time = Math.round(performance.now());

    const data = await sendPayload({
      payload_type: 'pageview',
      pathname: window.location.pathname,
      referrer: document.referrer || null,
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      browser_language: navigator.language,
      utm_source: getUTM('utm_source'),
      utm_medium: getUTM('utm_medium'),
      utm_campaign: getUTM('utm_campaign'),
      utm_term: getUTM('utm_term'),
      utm_content: getUTM('utm_content'),
      client_bot_reason: client_bot_reason,
      exec_time: current_exec_time
    });
    
    if (data && data.pageview_id) {
      pageview_id = data.pageview_id;
    }
  };

  const handleRouteChange = () => {
    const currentPage = window.location.pathname;
    if (currentPage === lastPage) return;
    if (pageview_id) {
      const duration_seconds = Math.round((Date.now() - startTime) / 1000);
      sendPayload({
        payload_type: 'update',
        pageview_id,
        duration_seconds,
        scroll_depth: maxScroll > 100 ? 100 : maxScroll
      });
    }
    lastPage = currentPage;
    startTime = Date.now();
    maxScroll = 0;
    pageview_id = null;
    initPageview();
  };

  const originalPushState = history.pushState;
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    handleRouteChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    handleRouteChange();
  };

  window.addEventListener('popstate', handleRouteChange);

  // 5. Tracking Scroll
  window.addEventListener('scroll', () => {
    const scrollPercent = Math.round((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100);
    if (scrollPercent > maxScroll) maxScroll = scrollPercent;
  }, { passive: true });

  // 6. Tracking clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link || !pageview_id) return;

    const isExternal = link.hostname !== window.location.hostname;
    const isDownload = link.pathname.match(/\.(pdf|zip|csv|docx?|xlsx?)$/i);

    if (isExternal || isDownload) {
      sendPayload({
        payload_type: 'event',
        pageview_id,
        event_type: isDownload ? 'download' : 'outbound',
        event_name: link.href
      });
    }
  });

  // 7. Tracking timer
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pageview_id) {
      const duration_seconds = Math.round((Date.now() - startTime) / 1000);
      sendPayload({
        payload_type: 'update',
        pageview_id,
        duration_seconds,
        scroll_depth: maxScroll > 100 ? 100 : maxScroll
      });
    }
  });

  // 8. Tracking events
  window.alternytics = function(eventName, eventValue = null) {
    if (!pageview_id) return;
    sendPayload({
      payload_type: 'event',
      pageview_id,
      event_type: 'custom',
      event_name: eventName,
      event_value: eventValue
    });
  };

  initPageview();
})();