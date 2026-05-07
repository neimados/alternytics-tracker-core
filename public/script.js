(function() {
  const sanitizeUrl = (urlString) => {
    if (!urlString) return null;
    try {
      const isRelative = !urlString.startsWith('http');
      const urlObj = new URL(urlString, isRelative ? 'http://dummy.com' : undefined);
      
      const sensitiveKeys = ['email', 'mail', 'password', 'pwd', 'token', 'auth', 'key', 'secret', 'hash', 'signature', 'adresse', 'phone', 'tel', 'name', 'firstname', 'lastname'];
      
      for (const key of Array.from(urlObj.searchParams.keys())) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          urlObj.searchParams.delete(key);
        }
      }
      
      if (isRelative) {
        return urlObj.pathname + (urlObj.search ? urlObj.search : '');
      }
      return urlObj.href;
    } catch (e) {
      return urlString.split('?')[0];
    }
  };
  // ------------------------------------------------------------------

  // 1. Config
  const scriptTag = document.currentScript || document.querySelector('script[data-site-id]');
  if (!scriptTag) return;
  
  const site_id = scriptTag.getAttribute('data-site-id');
  const api_url = 'https://alternytics.vercel.app/api/collect'; 
  
  let pageview_id = null;
  let startTime = Date.now();
  let maxScroll = 0;
  let lastPage = sanitizeUrl(window.location.pathname + window.location.search); 

  // 2. Extraction
  const urlParams = new URLSearchParams(window.location.search);
  const getUTM = (param) => urlParams.get(param) || null;
  const detectClientBot = () => {
    if (navigator.webdriver) return "Navigateur Automatisé (Webdriver)";
    if (document.visibilityState === 'visible') {
      if (window.outerWidth === 0 && window.outerHeight === 0) return "Headless Browser";
    }
    return null;
  };

  // 3. Send
  const sendPayload = async (data) => {
    try {
      const response = await fetch(api_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id, ...data }),
        keepalive: true
      });
      return await response.json();
    } catch (e) { /* Fail */ }
  };

  // 4. Init
  const initPageview = async () => {
    const client_bot_reason = detectClientBot();
    const current_exec_time = Math.round(performance.now());
    const safePathname = sanitizeUrl(window.location.pathname + window.location.search);
    const safeReferrer = sanitizeUrl(document.referrer) || null;

    const data = await sendPayload({
      payload_type: 'pageview',
      pathname: safePathname,
      referrer: safeReferrer,
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
      lastPage = safePathname;
    }
  };

  const handleRouteChange = () => {
    const currentPage = sanitizeUrl(window.location.pathname + window.location.search);

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

  // 5. Tracking scroll
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
        event_name: sanitizeUrl(link.href) 
      });
    }
  });

  // 7. Timer
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

  // 8. Events
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