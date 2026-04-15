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

// تخزين مؤقت للطلبات (في production استخدم Redis أو قاعدة بيانات)
const requestCache = new Map();
const verifiedSessions = new Map();

// إعدادات خدمات CAPTCHA (يجب استبدالها بمفاتيح حقيقية من 2captcha أو capsolver)
const CAPTCHA_SERVICES = {
    '2captcha': {
        apiKey: process.env.CAPTCHA_API_KEY || 'YOUR_2CAPTCHA_API_KEY',
        url: 'https://2captcha.com/in.php',
        resultUrl: 'https://2captcha.com/res.php'
    },
    'capsolver': {
        apiKey: process.env.CAPSOLVER_API_KEY || 'YOUR_CAPSOLVER_API_KEY',
        url: 'https://api.capsolver.com/createTask',
        resultUrl: 'https://api.capsolver.com/getTaskResult'
    }
};

// دالة لحل reCAPTCHA باستخدام 2captcha
async function solveRecaptcha2Captcha(siteKey, pageUrl) {
    const apiKey = CAPTCHA_SERVICES['2captcha'].apiKey;
    
    // إرسال طلب لحل CAPTCHA
    const response = await axios.post(CAPTCHA_SERVICES['2captcha'].url, null, {
        params: {
            key: apiKey,
            method: 'userrecaptcha',
            googlekey: siteKey,
            pageurl: pageUrl,
            json: 1
        }
    });
    
    if (response.data.status !== 1) {
        throw new Error(`2Captcha error: ${response.data.request}`);
    }
    
    const requestId = response.data.request;
    
    // انتظار النتيجة
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const resultResponse = await axios.get(CAPTCHA_SERVICES['2captcha'].resultUrl, {
            params: {
                key: apiKey,
                action: 'get',
                id: requestId,
                json: 1
            }
        });
        
        if (resultResponse.data.status === 1) {
            return resultResponse.data.request;
        }
        
        if (resultResponse.data.request === 'CAPCHA_NOT_READY') {
            continue;
        }
        
        throw new Error(`2Captcha error: ${resultResponse.data.request}`);
    }
    
    throw new Error('Timeout waiting for CAPTCHA solution');
}

// دالة لحل reCAPTCHA باستخدام Capsolver
async function solveRecaptchaCapsolver(siteKey, pageUrl) {
    const apiKey = CAPTCHA_SERVICES['capsolver'].apiKey;
    
    // إنشاء المهمة
    const createTaskResponse = await axios.post(CAPTCHA_SERVICES['capsolver'].url, {
        clientKey: apiKey,
        task: {
            type: 'ReCaptchaV2TaskProxyless',
            websiteURL: pageUrl,
            websiteKey: siteKey
        }
    });
    
    if (!createTaskResponse.data.taskId) {
        throw new Error('Failed to create task');
    }
    
    const taskId = createTaskResponse.data.taskId;
    
    // انتظار النتيجة
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const getResultResponse = await axios.post(CAPTCHA_SERVICES['capsolver'].resultUrl, {
            clientKey: apiKey,
            taskId: taskId
        });
        
        if (getResultResponse.data.status === 'ready') {
            return getResultResponse.data.solution.gRecaptchaResponse;
        }
        
        if (getResultResponse.data.status === 'processing') {
            continue;
        }
        
        throw new Error(`Capsolver error: ${getResultResponse.data.errorDescription}`);
    }
    
    throw new Error('Timeout waiting for CAPTCHA solution');
}

// API端点: حل CAPTCHA
app.post('/api/captcha/solve', async (req, res) => {
    try {
        const { type, siteKey, pageUrl } = req.body;
        
        if (!siteKey || !pageUrl) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: siteKey, pageUrl'
            });
        }
        
        console.log(`[CAPTCHA] Solving request for ${pageUrl} with siteKey: ${siteKey}`);
        
        let token = null;
        
        // محاولة الحل باستخدام 2captcha أولاً
        try {
            token = await solveRecaptcha2Captcha(siteKey, pageUrl);
            console.log('[CAPTCHA] Solved using 2captcha');
        } catch (error) {
            console.log(`[CAPTCHA] 2captcha failed: ${error.message}`);
            
            // محاولة الحل باستخدام capsolver
            try {
                token = await solveRecaptchaCapsolver(siteKey, pageUrl);
                console.log('[CAPTCHA] Solved using capsolver');
            } catch (error2) {
                console.log(`[CAPTCHA] Capsolver failed: ${error2.message}`);
                throw new Error('All CAPTCHA services failed');
            }
        }
        
        // تخزين الرمز في缓存
        const requestId = crypto.randomBytes(16).toString('hex');
        requestCache.set(requestId, {
            token: token,
            timestamp: Date.now(),
            pageUrl: pageUrl
        });
        
        // تنظيف缓存 القديم كل ساعة
        setTimeout(() => {
            requestCache.delete(requestId);
        }, 3600000);
        
        res.json({
            success: true,
            token: token,
            requestId: requestId
        });
        
    } catch (error) {
        console.error('[CAPTCHA] Error:', error.message);
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
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Missing token'
            });
        }
        
        console.log(`[VERIFY] Verifying token for ${url || 'unknown URL'}`);
        
        // هنا يمكن إضافة منطق إضافي للتحقق من صحة الرمز
        // مثل الاتصال بـ Google API للتحقق من الرمز
        
        // إنشاء معرف جلسة فريد
        const sessionId = crypto.randomBytes(32).toString('hex');
        verifiedSessions.set(sessionId, {
            token: token,
            verifiedAt: Date.now(),
            url: url
        });
        
        // تنظيف الجلسات القديمة
        setTimeout(() => {
            verifiedSessions.delete(sessionId);
        }, 3600000);
        
        res.json({
            success: true,
            sessionId: sessionId,
            message: 'CAPTCHA verified successfully'
        });
        
    } catch (error) {
        console.error('[VERIFY] Error:', error.message);
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
        timestamp: Date.now(),
        uptime: process.uptime(),
        cacheSize: requestCache.size,
        sessionsSize: verifiedSessions.size
    });
});

// API端点: إحصائيات
app.get('/api/stats', (req, res) => {
    res.json({
        totalRequests: requestCache.size,
        totalSessions: verifiedSessions.size,
        serverTime: new Date().toISOString()
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`[SERVER] CAPTCHA Solver Server running on port ${PORT}`);
    console.log(`[SERVER] Health check: http://localhost:${PORT}/api/health`);
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[FATAL] Unhandled rejection:', error);
});