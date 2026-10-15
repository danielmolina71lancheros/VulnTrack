const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST;
const transporter = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
        ...(process.env.SMTP_USER && process.env.SMTP_PASS
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
            : {}),
    })
    : null;

const enviarCorreo = async (destinatario, asunto, cuerpoHtml) => {
    if (!transporter) {
        console.warn('[EMAIL] SMTP no configurado; se conserva la notificacion en la aplicacion.');
        return { ok: false, error: 'SMTP no configurado' };
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || 'VulnTrack <noreply@localhost>',
            to: destinatario,
            subject: asunto,
            html: cuerpoHtml,
        });
        console.log(`[EMAIL ENVIADO] ${info.messageId} a ${destinatario}`);
        return { ok: true, messageId: info.messageId };
    } catch (error) {
        console.error('[ERROR EMAIL]:', error.message);
        return { ok: false, error: error.message };
    }
};

module.exports = { enviarCorreo };
