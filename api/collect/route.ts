import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import spammers from './spammers.json';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getSecureCorsHeaders(allowedOrigin: string) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(request: Request) {
  const requestOrigin = request.headers.get('origin') || '*';

  return new NextResponse(null, {
    status: 200,
    headers: getSecureCorsHeaders(requestOrigin)
  });
}

function parseUserAgent(ua: string) {
  let browser_name = 'Autre', os_name = 'Autre', device_type = 'desktop';

  // 1. Device Type
  if (/tablet|ipad/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    device_type = 'tablet';
  } else if (/mobile|iphone|ipod/i.test(ua)) {
    device_type = 'mobile';
  }

  // 2. OS
  if (/iphone|ipad|ipod/i.test(ua)) os_name = 'iOS';
  else if (/mac/i.test(ua)) os_name = 'macOS'; 
  else if (/android/i.test(ua)) os_name = 'Android';
  else if (/windows/i.test(ua)) os_name = 'Windows';
  else if (/cros/i.test(ua)) os_name = 'Chrome OS';
  else if (/linux/i.test(ua)) os_name = 'Linux';

  // 3. Browser
  if (/samsungbrowser/i.test(ua)) browser_name = 'Samsung Internet';
  else if (/opr\/|opera/i.test(ua)) browser_name = 'Opera';
  else if (/edg/i.test(ua)) browser_name = 'Edge';
  else if (/firefox|fxios/i.test(ua)) browser_name = 'Firefox';
  else if (/chrome|crios|crmo/i.test(ua)) browser_name = 'Chrome';
  else if (/safari/i.test(ua)) browser_name = 'Safari';

  return { browser_name, os_name, device_type };
}

// ─── BOT FILTERING ───
// ADD YOUR analyzeTraffic function here

// 3. POST
export async function POST(request: Request) {
  let corsHeaders: Record<string, string> = {};
  try {
    const requestOrigin = request.headers.get('origin');

    if (!requestOrigin) {
      return NextResponse.json({ error: "Origine invalide" }, { status: 403 });
    }

    corsHeaders = getSecureCorsHeaders(requestOrigin);

    const cleanDomain = requestOrigin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const { data: corsSite, error: corsSiteError } = await supabase
      .from('sites')
      .select('id, workspaces!inner(expires_at)')
      .eq('domain', cleanDomain)
      .gt('workspaces.expires_at', new Date().toISOString())
      .single();

    if (corsSiteError || !corsSite) {
      return NextResponse.json({ error: "Access denied." }, { status: 403, headers: corsHeaders });
    }
    const body = await request.json();
    const { payload_type, site_id, pageview_id, exec_time } = body;

    if (!site_id) return NextResponse.json({ error: 'site_id manquant' }, { status: 400, headers: corsHeaders });

    const origin = request.headers.get('origin') || request.headers.get('referer') || '';

    const { data: siteData, error: siteError } = await supabase
      .from('sites')
      .select('domain, workspaces!inner(expires_at)')
      .eq('id', site_id)
      .gt('workspaces.expires_at', new Date().toISOString())
      .single();

    if (siteError || !siteData) {
      return NextResponse.json({ error: 'Site invalide ou abonnement expiré' }, { status: 403, headers: corsHeaders });
    }

    const isLocalTest = origin === 'null' || origin.includes('localhost');
    if (!origin.includes(siteData.domain) && !isLocalTest) {
      return NextResponse.json({ error: 'Domaine non autorisé' }, { status: 403, headers: corsHeaders });
    }

    // ANONYMIZATION
    const ip = request.headers.get('x-forwarded-for');
    const date = new Date().toISOString().split('T')[0];

    const country = request.headers.get('x-vercel-ip-country') || 'Inconnu';
    const city = request.headers.get('x-vercel-ip-city') || 'Inconnu';

    const userAgent = request.headers.get('user-agent') || '';
    const { browser_name, os_name, device_type } = parseUserAgent(userAgent);
    const salt = process.env.TRACKER_SALT;

    if (!salt) {
      console.error("Erreur critique : TRACKER_SALT manquant dans les variables d'environnement.");
    }

    const visitor_hash = crypto
      .createHash('sha256')
      .update(`${ip}-${userAgent}-${date}-${salt}`)
      .digest('hex');

    if (payload_type === 'pageview') {
      const serverAnalysis = analyzeTraffic(userAgent, body.pathname || '', body.referrer || '', exec_time);
      const isBot = serverAnalysis.isBot || !!body.client_bot_reason;
      const reason = body.client_bot_reason || serverAnalysis.reason;

      const { data, error } = await supabase.rpc('log_pageview', {
        p_site_id: site_id,
        p_visitor_hash: visitor_hash,
        p_pathname: body.pathname || null,
        p_referrer: body.referrer || null,
        p_screen_resolution: body.screen_resolution || null,
        p_browser_language: body.browser_language || null,
        p_utm_source: body.utm_source || null,
        p_utm_medium: body.utm_medium || null,
        p_utm_campaign: body.utm_campaign || null,
        p_utm_term: body.utm_term || null,
        p_utm_content: body.utm_content || null,
        p_country: country,
        p_city: city,
        p_browser_name: browser_name,
        p_os_name: os_name,
        p_device_type: device_type,
        p_is_bot: isBot,
        p_bot_reason: reason || null
      });

      if (error) {
        if (error.message.includes('QUOTA_EXCEEDED')) {
          return NextResponse.json({ error: 'Quota mensuel dépassé' }, { status: 403, headers: corsHeaders });
        }
        if (error.message.includes('SITE_NOT_FOUND')) {
          return NextResponse.json({ error: 'Site introuvable' }, { status: 404, headers: corsHeaders });
        }
        throw error;
      }
      return NextResponse.json({ success: true, pageview_id: data }, { status: 200, headers: corsHeaders });
    }

    if (payload_type === 'update' && pageview_id) {
      const { error } = await supabase
        .from('pageviews')
        .update({
          duration_seconds: body.duration_seconds,
          scroll_depth: body.scroll_depth
        })
        .eq('id', pageview_id)
        .eq('visitor_hash', visitor_hash);

      if (error) throw error;
      return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
    }

    if (payload_type === 'event' && pageview_id) {
      const serverAnalysis = analyzeTraffic(userAgent, body.pathname || '');
      const isBot = serverAnalysis.isBot || !!body.client_bot_reason;
      const reason = body.client_bot_reason || serverAnalysis.reason;

      const { error } = await supabase
        .from('events')
        .insert([{
          site_id, pageview_id, visitor_hash,
          event_type: body.event_type,
          event_name: body.event_name,
          event_value: body.event_value || null,
          is_bot: isBot,
          bot_reason: reason || null
        }]);

      if (error) throw error;
      return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
    }

    return NextResponse.json({ error: 'Type de payload inconnu' }, { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error("Erreur serveur API:", error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500, headers: corsHeaders });
  }
}