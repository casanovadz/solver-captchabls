const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تخزين مؤقت للجلسات
const verifiedSessions = new Map();

// مفتاح API من 2captcha (يجب استبداله بمفتاح حقيقي)
// يمكنك الحصول على مفتاح مجاني تجريبي من: https://2captcha.com
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || 'YOUR_2CAPTCHA_API_KEY_HERE';

// دالة حل reCAPTCHA V2 باستخدام 2captcha
async function solveRecaptchaV2(siteKey, pageUrl) {
    try {
        console.log(`[2CAPTCHA] جاري إرسال طلب حل CAPTCHA لـ ${pageUrl}`);
        
        // إرسال طلب لحل CAPTCHA
        const sendResponse = await axios.get('http://2captcha.com/in.php', {
            params: {
                key: CAPTCHA_API_KEY,
                method: 'userrecaptcha',
                googlekey: siteKey,
                pageurl: pageUrl,
                json: 1
            }
        });
        
        if (sendResponse.data.status !== 1) {
            throw new Error(`2captcha error: ${sendResponse.data.request}`);
        }
        
        const requestId = sendResponse.data.request;
        console.log(`[2CAPTCHA] تم إرسال الطلب، ID: ${requestId}`);
        
        // انتظار النتيجة (قد يستغرق 10-30 ثانية)
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const getResponse = await axios.get('http://2captcha.com/res.php', {
                params: {
                    key: CAPTCHA_API_KEY,
                    action: 'get',
                    id: requestId,
                    json: 1
                }
            });
            
            if (getResponse.data.status === 1) {
                console.log(`[2CAPTCHA] ✅ تم حل CAPTCHA بنجاح`);
                return getResponse.data.request;
            }
            
            if (getResponse.data.request === 'CAPCHA_NOT_READY') {
                console.log(`[2CAPTCHA] جاري انتظار الحل... (${i + 1}/60)`);
                continue;
            }
            
            throw new Error(`2captcha error: ${getResponse.data.request}`);
        }
        
        throw new Error('انتهى الوقت المحدد لانتظار حل CAPTCHA');
        
    } catch (error) {
        console.error(`[2CAPTCHA] خطأ: ${error.message}`);
        throw error;
    }
}

// دالة حل hCaptcha باستخدام 2captcha
async function solveHCaptcha(siteKey, pageUrl) {
    try {
        console.log(`[2CAPTCHA] جاري إرسال طلب حل hCaptcha لـ ${pageUrl}`);
        
        const sendResponse = await axios.get('http://2captcha.com/in.php', {
            params: {
                key: CAPTCHA_API_KEY,
                method: 'hcaptcha',
                sitekey: siteKey,
                pageurl: pageUrl,
                json: 1
            }
        });
        
        if (sendResponse.data.status !== 1) {
            throw new Error(`2captcha error: ${sendResponse.data.request}`);
        }
        
        const requestId = sendResponse.data.request;
        console.log(`[2CAPTCHA] تم إرسال طلب hCaptcha، ID: ${requestId}`);
        
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const getResponse = await axios.get('http://2captcha.com/res.php', {
                params: {
                    key: CAPTCHA_API_KEY,
                    action: 'get',
                    id: requestId,
                    json: 1
                }
            });
            
            if (getResponse.data.status === 1) {
                console.log(`[2CAPTCHA] ✅ تم حل hCaptcha بنجاح`);
                return getResponse.data.request;
            }
            
            if (getResponse.data.request === 'CAPCHA_NOT_READY') {
                console.log(`[2CAPTCHA] جاري انتظار حل hCaptcha... (${i + 1}/60)`);
                continue;
            }
            
            throw new Error(`2captcha error: ${getResponse.data.request}`);
        }
        
        throw new Error('انتهى الوقت المحدد لانتظار حل hCaptcha');
        
    } catch (error) {
        console.error(`[2CAPTCHA] خطأ: ${error.message}`);
        throw error;
    }
}

// API端点: حل CAPTCHA
app.post('/api/captcha/solve', async (req, res) => {
    try {
        const { type, siteKey, pageUrl } = req.body;
        
        console.log(`[CAPTCHA] طلب حل CAPTCHA - النوع: ${type}, الموقع: ${pageUrl}`);
        
        if (!siteKey || !pageUrl) {
            return res.status(400).json({
                success: false,
                error: 'SiteKey و PageUrl مطلوبان'
            });
        }
        
        let token = null;
        
        if (type === 'recaptcha' || type === 'recaptcha_v2') {
            token = await solveRecaptchaV2(siteKey, pageUrl);
        } else if (type === 'hcaptcha') {
            token = await solveHCaptcha(siteKey, pageUrl);
        } else {
            // محاولة التعرف التلقائي
            try {
                token = await solveRecaptchaV2(siteKey, pageUrl);
            } catch (e) {
                token = await solveHCaptcha(siteKey, pageUrl);
            }
        }
        
        res.json({
            success: true,
            token: token,
            message: 'تم حل CAPTCHA بنجاح'
        });
        
    } catch (error) {
        console.error('[CAPTCHA] خطأ:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API端点: التحقق من صحة CAPTCHA (للمحاكاة)
app.post('/api/captcha/verify', async (req, res) => {
    try {
        const { id, token, url, timestamp } = req.body;
        
        console.log(`[VERIFY] طلب التحقق - الرمز: ${token ? token.substring(0, 30) + '...' : 'غير موجود'}`);
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'الرمز غير موجود'
            });
        }
        
        // هنا يمكن إضافة منطق للتحقق من صحة الرمز مع Google API
        // للتجربة، نعتبر الرمز صحيحاً إذا كان طويلاً بما فيه الكفاية
        const isValid = token && token.length > 50;
        
        if (isValid) {
            const sessionId = crypto.randomBytes(32).toString('hex');
            verifiedSessions.set(sessionId, {
                token: token,
                verifiedAt: Date.now(),
                url: url,
                id: id
            });
            
            setTimeout(() => {
                verifiedSessions.delete(sessionId);
            }, 3600000);
            
            res.json({
                success: true,
                sessionId: sessionId,
                message: 'تم التحقق من CAPTCHA بنجاح'
            });
        } else {
            res.json({
                success: false,
                error: 'رمز CAPTCHA غير صالح'
            });
        }
        
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
        mode: '2captcha - real solving mode',
        apiKeyConfigured: CAPTCHA_API_KEY !== 'YOUR_2CAPTCHA_API_KEY_HERE',
        timestamp: Date.now(),
        uptime: process.uptime(),
        sessionsSize: verifiedSessions.size
    });
});

// API端点: مساعدة
app.get('/api/help', (req, res) => {
    res.json({
        name: 'BLS CAPTCHA Solver Server',
        version: '2.0.0',
        mode: '2captcha - real solving',
        endpoints: {
            'POST /api/captcha/solve': 'طلب حل CAPTCHA (يتطلب siteKey و pageUrl)',
            'POST /api/captcha/verify': 'التحقق من صحة الرمز',
            'GET /api/health': 'فحص صحة الخادم',
            'GET /api/help': 'هذه المساعدة'
        },
        requiredEnv: {
            CAPTCHA_API_KEY: 'مفتاح API من 2captcha.com'
        },
        howToGetApiKey: 'سجل في https://2captcha.com واحصل على مفتاح API'
    });
});

// تشغيل الخادم
app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     BLS CAPTCHA SOLVER SERVER - REAL MODE                 ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🚀 الخادم يعمل على: http://localhost:${PORT}              ║`);
    console.log(`║  📋 فحص الصحة: http://localhost:${PORT}/api/health        ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    if (CAPTCHA_API_KEY === 'YOUR_2CAPTCHA_API_KEY_HERE') {
        console.log('║  ⚠️  تحذير: لم يتم تكوين مفتاح 2CAPTCHA!                 ║');
        console.log('║  📝 للحصول على مفتاح: https://2captcha.com             ║');
        console.log('║  🔧 قم بتعيين المتغير: CAPTCHA_API_KEY                  ║');
    } else {
        console.log('║  ✅ تم تكوين مفتاح 2CAPTCHA بنجاح                        ║');
    }
    
    console.log('╚════════════════════════════════════════════════════════════╝');
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ خطأ في Promise:', error);
});
