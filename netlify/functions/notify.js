/**
 * Roccabella Proposals — Email Notification Function
 * Sends email to Josh when:
 *   1. A proposal is viewed for the first time
 *   2. A client submits an enquiry with shortlisted yachts
 *
 * Deploy: Netlify Functions (netlify/functions/notify.js)
 * Requires: RESEND_API_KEY env var (or use Supabase Edge Functions)
 */

const BROKER_EMAIL = 'josh.cripps@roccabellayachts.com';
const FROM_EMAIL = 'notifications@proposals.roccabellayachts.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Supabase admin client for checking first-view status
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service role key for admin access
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { type, proposalId, viewerName, shortlistedYachtIds, message } = body;

    // Fetch proposal details
    const { data: proposal } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (!proposal) {
      return { statusCode: 404, body: 'Proposal not found' };
    }

    let emailSubject, emailHtml;

    if (type === 'first_view') {
      // Check if this is genuinely the first view
      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('type', 'first_view')
        .limit(1);

      if (existingNotif && existingNotif.length > 0) {
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Already notified' }) };
      }

      emailSubject = `👀 Proposal viewed: ${proposal.client_name}`;
      emailHtml = `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="font-size: 10px; letter-spacing: 3px; color: #0f1d2f; margin-bottom: 30px;">ROCCABELLA YACHTS</div>
          <h2 style="color: #0f1d2f; font-weight: 400; margin-bottom: 8px;">Proposal Opened</h2>
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
            <strong>${viewerName || 'A viewer'}</strong> just opened your proposal for
            <strong>${proposal.client_name}</strong>.
          </p>
          <div style="background: #f5f1eb; padding: 20px; margin: 24px 0;">
            <div style="font-size: 12px; color: #64748b;">Proposal</div>
            <div style="font-size: 16px; color: #0f1d2f; font-weight: 600;">${proposal.title}</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${proposal.destination || ''}</div>
          </div>
          <a href="https://admin.roccabellayachts.com/proposal/${proposal.id}" 
             style="display: inline-block; padding: 12px 24px; background: #0f1d2f; color: #fff; text-decoration: none; font-size: 13px; letter-spacing: 1px;">
            VIEW ANALYTICS
          </a>
        </div>
      `;
    }

    else if (type === 'enquiry') {
      // Fetch yacht names for the shortlisted IDs
      let yachtNames = [];
      if (shortlistedYachtIds && shortlistedYachtIds.length > 0) {
        const { data: yachts } = await supabase
          .from('yachts')
          .select('name')
          .in('id', shortlistedYachtIds);
        yachtNames = (yachts || []).map(y => y.name);
      }

      emailSubject = `🎯 Enquiry received: ${proposal.client_name}`;
      emailHtml = `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="font-size: 10px; letter-spacing: 3px; color: #0f1d2f; margin-bottom: 30px;">ROCCABELLA YACHTS</div>
          <h2 style="color: #c43a2b; font-weight: 400; margin-bottom: 8px;">New Enquiry Received</h2>
          <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
            <strong>${viewerName}</strong> has submitted an enquiry from the
            <strong>${proposal.client_name}</strong> proposal.
          </p>
          ${yachtNames.length > 0 ? `
          <div style="background: #fef9f0; border-left: 3px solid #c9a96e; padding: 16px 20px; margin: 24px 0;">
            <div style="font-size: 11px; color: #c9a96e; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">SHORTLISTED YACHTS</div>
            ${yachtNames.map(n => `<div style="font-size: 15px; color: #0f1d2f; font-weight: 600; margin-bottom: 4px;">♥ ${n}</div>`).join('')}
          </div>` : ''}
          ${message ? `
          <div style="background: #f5f1eb; padding: 16px 20px; margin: 24px 0;">
            <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">MESSAGE</div>
            <div style="font-size: 14px; color: #0f1d2f; line-height: 1.6;">${message}</div>
          </div>` : ''}
          <a href="https://admin.roccabellayachts.com/proposal/${proposal.id}" 
             style="display: inline-block; padding: 12px 24px; background: #c43a2b; color: #fff; text-decoration: none; font-size: 13px; letter-spacing: 1px;">
            RESPOND NOW
          </a>
        </div>
      `;
    }

    else {
      return { statusCode: 400, body: 'Unknown notification type' };
    }

    // Send email via Resend
    if (RESEND_API_KEY) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: BROKER_EMAIL,
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error('Resend error:', errText);
      }
    } else {
      console.log('RESEND_API_KEY not set, email would be:', emailSubject);
    }

    // Log notification
    await supabase.from('notifications').insert({
      proposal_id: proposalId,
      type,
      recipient: BROKER_EMAIL,
      payload: body,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, type }),
    };

  } catch (err) {
    console.error('Notification error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
