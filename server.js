const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تخزين مؤقت للجلسات
const verifiedSessions = new Map();

// دالة محاكاة حل CAPTCHA (بدون API خارجي)
function simulateCaptchaSolve(siteKey, pageUrl) {
    // إنشاء رمز وهمي للاختبار
    const mockToken = `mock_captcha_token_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
    
    console.log(`[MOCK CAPTCHA] تم إنشاء رمز وهمي لـ ${pageUrl}`);
    console.log(`[MOCK CAPTCHA] Site Key: ${siteKey || 'غير محدد'}`);
    console.log(`[MOCK CAPTCHA] Token: ${mockToken}`);
    
    return mockToken;
}

// API端点: حل CAPTCHA (محاكاة)
app.post('/api/captcha/solve', async (req, res) => {
    try {
        const { type, siteKey, pageUrl } = req.body;
        
        console.log(`[CAPTCHA] طلب حل CAPTCHA لـ ${pageUrl || 'عنوان غير معروف'}`);
        console.log(`[CAPTCHA] النوع: ${type || 'غير محدد'}`);
        console.log(`[CAPTCHA] Site Key: ${siteKey || 'غير محدد'}`);
        
        // محاكاة حل CAPTCHA
        const token = simulateCaptchaSolve(siteKey, pageUrl);
        
        // تخزين الرمز في缓存
        const requestId = crypto.randomBytes(16).toString('hex');
        
        res.json({
            success: true,
            token: token,
            requestId: requestId,
            message: "تم حل CAPTCHA بنجاح (وضع المحاكاة)"
        });
        
    } catch (error) {
        console.error('[CAPTCHA] خطأ:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API端点: التحقق من صحة CAPTCHA
app.post('/api/captcha/verify', async (req, res) => {
    try {
        const { id, token, url, timestamp } = req.body;
        
        console.log(`[VERIFY] طلب التحقق من الرمز لـ ${url || 'عنوان غير معروف'}`);
        console.log(`[VERIFY] ID: ${id || 'غير محدد'}`);
        console.log(`[VERIFY] Token: ${token ? token.substring(0, 50) + '...' : 'غير موجود'}`);
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'الرمز غير موجود'
            });
        }
        
        // في وضع المحاكاة، نعتبر أي رمز صحيحاً
        // يمكنك تعديل هذا المنطق حسب الحاجة
        
        // إنشاء معرف جلسة فريد
        const sessionId = crypto.randomBytes(32).toString('hex');
        verifiedSessions.set(sessionId, {
            token: token,
            verifiedAt: Date.now(),
            url: url,
            id: id
        });
        
        // تنظيف الجلسات القديمة كل ساعة
        setTimeout(() => {
            verifiedSessions.delete(sessionId);
        }, 3600000);
        
        console.log(`[VERIFY] ✅ تم التحقق بنجاح - Session ID: ${sessionId}`);
        
        res.json({
            success: true,
            sessionId: sessionId,
            message: 'تم التحقق من CAPTCHA بنجاح (وضع المحاكاة)',
            data: {
                verified: true,
                timestamp: Date.now()
            }
        });
        
    } catch (error) {
        console.error('[VERIFY] خطأ:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API端点: الحصول على حالة الخادم
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: 'localhost - simulation mode',
        timestamp: Date.now(),
        uptime: process.uptime(),
        sessionsSize: verifiedSessions.size
    });
});

// API端点: إحصائيات
app.get('/api/stats', (req, res) => {
    res.json({
        totalSessions: verifiedSessions.size,
        serverTime: new Date().toISOString(),
        mode: 'simulation',
        message: 'الخادم يعمل في وضع المحاكاة - لا حاجة لمفتاح API'
    });
});

// API端点: مساعدة
app.get('/api/help', (req, res) => {
    res.json({
        name: 'BLS CAPTCHA Solver Server',
        version: '1.0.0',
        mode: 'localhost - simulation',
        endpoints: {
            'POST /api/captcha/solve': 'طلب حل CAPTCHA',
            'POST /api/captcha/verify': 'التحقق من صحة الرمز',
            'GET /api/health': 'فحص صحة الخادم',
            'GET /api/stats': 'إحصائيات الخادم',
            'GET /api/help': 'هذه المساعدة'
        },
        note: 'هذا الخادم يعمل في وضع المحاكاة ولا يحتاج إلى مفاتيح API خارجية'
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     BLS CAPTCHA SOLVER SERVER - LOCALHOST MODE            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🚀 الخادم يعمل على: http://localhost:${PORT}              ║`);
    console.log(`║  📋 فحص الصحة: http://localhost:${PORT}/api/health        ║`);
    console.log(`║  ℹ️  مساعدة: http://localhost:${PORT}/api/help             ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  ⚠️  وضع المحاكاة - لا حاجة لمفتاح API                     ║');
    console.log('║  📝 سيتم إنشاء رموز وهمية للاختبار                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ خطأ في Promise:', error);
});
