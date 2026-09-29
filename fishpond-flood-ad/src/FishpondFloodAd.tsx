// ============ EDITABLE CONSTANTS ============
const BRAND = {
  primaryColor: '#FF6B1B',   // 热带橙
  accentColor: '#00D4FF',    // 洪水蓝
  backgroundColor: '#1A1F36', // 深蓝夜景
  textColor: '#FFFFFF',
  warningColor: '#FFD23F',   // 警示黄
  heartColor: '#FF3B6E',     // 爱心红
};

const TIMING = {
  fps: 30,
  totalDuration: 15, // 秒
};

// 用户提供的完整泰语配音（修正拼写）
const THAI_TEXT = {
  hook: [
    'เฮ้ย! นํ้าท่วมนครศรเทพ',
    'แตบ่อเราไมส่ น! 🐟🌊'
  ],
  complaint: [
    'ปลาอยางเรา วายสบายใจ 555',
    'แตพี่ๆ นกตกปลาหายไปไหน? กลัวเปียกเหรอ? 😏'
  ],
  reward: [
    'มาดี! วันนนี้ปลากินดุมาก',
    'ไมงั้นเดี๋ยวปลาอุนนนะครับ! 🪙'
  ],
  cta: [
    'พิกดบ่อ... กดลิงคเลย!',
    'รออยูนะ! 📍 Hook Happyness'
  ],
};

// 场景时间线
const SCENES = {
  hook: { start: 0, end: 90 },       // 0-3s
  complaint: { start: 90, end: 240 }, // 3-8s
  reward: { start: 240, end: 360 },   // 8-12s
  cta: { start: 360, end: 450 },      // 12-15s
};
// ============================================

import { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Sequence } from 'remotion';
import { Img, staticFile } from 'remotion';

// 弹跳缩放
const bounceScale = (frame: number, start: number, damping = 12, stiffness = 150) =>
  spring({ frame: frame - start, fps: TIMING.fps, config: { damping, stiffness } });

// ============ SCENE 1: HOOK (0-3s) ============
const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();

  const text1Opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const text2Opacity = interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  // 鱼弹跳进入
  const fishScale = bounceScale(frame, 5, 15, 120);
  
  // 警报闪烁
  const alarmFlash = Math.floor(frame / 10) % 2 === 0;
  
  // 潜水镜发光
  const glassesGlow = interpolate(frame, [30, 50], [0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: config.width,
      height: config.height,
      background: `linear-gradient(180deg, #0A1628 0%, ${BRAND.backgroundColor} 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif",
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* 警报闪烁层 */}
      {alarmFlash && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,0,0,0.1)',
          pointerEvents: 'none',
        }} />
      )}

      {/* 暴雨粒子效果 */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: 2,
          height: 20 + Math.random() * 20,
          background: 'rgba(100,150,255,0.4)',
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animation: `rain ${0.5 + Math.random() * 0.5}s linear infinite`,
        }} />
      ))}

      {/* 大眼鱼特写 */}
      <div style={{
        width: 450,
        height: 450,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '12px solid ' + BRAND.accentColor,
        boxShadow: `0 0 80px ${BRAND.accentColor}, inset 0 0 40px rgba(0,0,0,0.5)`,
        transform: `scale(${fishScale})`,
        marginBottom: 50,
        position: 'relative',
        zIndex: 2,
      }}>
        <Img src={staticFile('assets/fish-hero.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        
        {/* 潜水镜叠加 */}
        <div style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 300,
          height: 140,
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 70,
          border: '10px solid #444',
          boxShadow: `0 0 40px rgba(0,212,255,${glassesGlow})`,
        }}>
          {/* 镜片反光 */}
          <div style={{ position: 'absolute', top: 25, left: 40, width: 70, height: 35, background: 'rgba(255,255,255,0.4)', borderRadius: '50%', transform: 'rotate(-30deg)' }} />
          <div style={{ position: 'absolute', top: 25, right: 40, width: 70, height: 35, background: 'rgba(255,255,255,0.4)', borderRadius: '50%', transform: 'rotate(-30deg)' }} />
        </div>
      </div>

      {/* 钩子文字 */}
      <div style={{ opacity: text1Opacity, fontSize: 54, fontWeight: 900, color: BRAND.warningColor, textAlign: 'center', padding: '0 40px', textShadow: '3px 3px 10px rgba(0,0,0,0.8)', zIndex: 2 }}>
        {THAI_TEXT.hook[0]}
      </div>
      <div style={{ opacity: text2Opacity, fontSize: 58, fontWeight: 900, color: BRAND.accentColor, textAlign: 'center', marginTop: 20, zIndex: 2 }}>
        {THAI_TEXT.hook[1]}
      </div>

      {/* 警报图标 */}
      <div style={{ position: 'absolute', top: 120, right: 70, fontSize: 110, animation: 'shake 0.5s ease-in-out infinite', zIndex: 2 }}>
        🚨
      </div>

      <style>{`
        @keyframes rain {
          0% { transform: translateY(-20px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-20deg); }
          75% { transform: rotate(20deg); }
        }
      `}</style>
    </div>
  );
};

// ============ SCENE 2: COMPLAINT (3-8s) ============
const ComplaintScene: React.FC = () => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();

  const text1Opacity = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const text2Opacity = interpolate(frame, [35, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const text2X = interpolate(frame, [35, 65], [60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 鱼惬意缩放
  const chillScale = bounceScale(frame, 10, 20, 100);

  return (
    <div style={{
      width: config.width,
      height: config.height,
      background: `linear-gradient(135deg, ${BRAND.backgroundColor} 0%, #0D2137 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif",
      padding: 60,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 水背景 */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, rgba(0,100,200,0.15) 0%, rgba(0,50,100,0.3) 100%)',
      }} />

      {/* 鱼塘全景 */}
      <div style={{
        width: 650,
        height: 430,
        borderRadius: 30,
        overflow: 'hidden',
        border: '6px solid ' + BRAND.accentColor,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 2,
        transform: `scale(${chillScale})`,
      }}>
        <Img src={staticFile('assets/pond-sunset.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        
        {/* "海景房"标签 */}
        <div style={{
          position: 'absolute',
          top: 25,
          right: 25,
          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
          color: '#000',
          fontSize: 40,
          fontWeight: 900,
          padding: '12px 30px',
          borderRadius: 25,
          transform: 'rotate(5deg)',
          boxShadow: '0 8px 25px rgba(255,215,0,0.6)',
        }}>
          🏠 海景房!
        </div>

        {/* 泡泡动画 */}
        {[0, 1, 2].map(i => {
          const bubbleFrame = Math.max(0, frame - i * 20);
          const bubbleY = interpolate(bubbleFrame, [0, 80], [500, -50], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const bubbleX = Math.sin(bubbleFrame * 0.1) * 30;
          const bubbleOpacity = interpolate(bubbleFrame, [0, 20, 60, 80], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${30 + i * 25 + bubbleX}px`,
              bottom: `${bubbleY}px`,
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(255,255,255,0.1))',
              border: '3px solid rgba(255,255,255,0.6)',
              opacity: bubbleOpacity,
              boxShadow: '0 0 15px rgba(255,255,255,0.4)',
            }} />
          );
        })}
      </div>

      {/* 文字内容 */}
      <div style={{ opacity: text1Opacity, fontSize: 58, fontWeight: 900, color: BRAND.textColor, textAlign: 'center', marginTop: 40, zIndex: 2, textShadow: '2px 2px 8px rgba(0,0,0,0.6)' }}>
        {THAI_TEXT.complaint[0]} 😎
      </div>
      <div style={{
        opacity: text2Opacity,
        transform: `translateX(${text2X}px)`,
        fontSize: 50,
        fontWeight: 700,
        color: BRAND.primaryColor,
        textAlign: 'center',
        marginTop: 25,
        zIndex: 2,
      }}>
        {THAI_TEXT.complaint[1]}
      </div>

      {/* 嘲笑声表情 */}
      <div style={{ position: 'absolute', bottom: 180, fontSize: 90, animation: 'bounce 1s ease-in-out infinite', zIndex: 2 }}>
        😂
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-25px); }
        }
      `}</style>
    </div>
  );
};

// ============ SCENE 3: REWARD (8-12s) ============
const RewardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 照片弹跳
  const photoScale = bounceScale(frame, 15, 18, 140);
  
  // 暴击闪烁
  const criticalFlash = Math.floor(frame / 8) % 2 === 0;

  return (
    <div style={{
      width: config.width,
      height: config.height,
      background: `linear-gradient(180deg, ${BRAND.primaryColor}33 0%, ${BRAND.backgroundColor} 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif",
      padding: 40,
      position: 'relative',
    }}>
      {/* 标题 */}
      <div style={{ opacity: titleOpacity, fontSize: 60, fontWeight: 900, color: BRAND.warningColor, textAlign: 'center', marginBottom: 35, textShadow: '3px 3px 10px rgba(0,0,0,0.5)' }}>
        {THAI_TEXT.reward[0]} 🏆
      </div>

      {/* 照片拼贴 */}
      <div style={{ display: 'flex', gap: 35, opacity: subtitleOpacity, transform: `scale(${photoScale})`, zIndex: 2 }}>
        {/* 大鱼照片 */}
        <div style={{
          width: 260,
          height: 260,
          borderRadius: 30,
          overflow: 'hidden',
          border: '6px solid ' + BRAND.accentColor,
          boxShadow: criticalFlash ? `0 0 80px ${BRAND.warningColor}` : '0 15px 50px rgba(0,0,0,0.5)',
          position: 'relative',
        }}>
          <Img src={staticFile('assets/customer-fish.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* 暴击特效 */}
          {criticalFlash && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 90,
              fontWeight: 900,
              color: '#FF0000',
              textShadow: '4px 4px 0 #FFF, -3px -3px 0 #FFF',
              animation: 'pulse 0.3s ease-in-out infinite',
            }}>
              暴击!
            </div>
          )}
          {/* 金币 */}
          <div style={{ position: 'absolute', top: -25, right: -25, fontSize: 70, animation: 'spin 2s linear infinite' }}>
            🪙
          </div>
        </div>

        {/* 池塘照片 */}
        <div style={{
          width: 260,
          height: 260,
          borderRadius: 30,
          overflow: 'hidden',
          border: '6px solid ' + BRAND.primaryColor,
          boxShadow: '0 15px 50px rgba(0,0,0,0.5)',
        }}>
          <Img src={staticFile('assets/pond-sunset.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      {/* 副标题 */}
      <div style={{
        opacity: interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        fontSize: 46,
        fontWeight: 700,
        color: BRAND.textColor,
        textAlign: 'center',
        marginTop: 45,
        zIndex: 2,
      }}>
        {THAI_TEXT.reward[1]}
      </div>

      {/* 跳动箭头 */}
      <div style={{ position: 'absolute', bottom: 220, fontSize: 110, animation: 'pointDown 1s ease-in-out infinite', zIndex: 2 }}>
        👇
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.3); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pointDown {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(25px); }
        }
      `}</style>
    </div>
  );
};

// ============ SCENE 4: CTA (12-15s) ============
const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();

  const logoOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const addressOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  // 按钮脉冲
  const buttonPulse = spring({ frame: frame - 20, fps: config.fps, config: { damping: 8, stiffness: 100 } });
  
  // 比心动画
  const heartScale = bounceScale(frame, 25, 15, 180);

  return (
    <div style={{
      width: config.width,
      height: config.height,
      background: `linear-gradient(180deg, ${BRAND.backgroundColor} 0%, #0A0F1A 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景池塘 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.25 }}>
        <Img src={staticFile('assets/pond-sunset.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {/* 主标志 */}
      <div style={{
        opacity: logoOpacity,
        transform: `scale(${buttonPulse})`,
        fontSize: 85,
        fontWeight: 900,
        color: BRAND.primaryColor,
        textAlign: 'center',
        textShadow: '0 5px 35px rgba(255,107,27,0.7)',
        zIndex: 2,
      }}>
        🎣 Hook Happyness
      </div>
      <div style={{ opacity: logoOpacity, fontSize: 56, fontWeight: 700, color: BRAND.textColor, textAlign: 'center', marginTop: 18, zIndex: 2 }}>
        乐钓鱼塘
      </div>

      {/* 地址 */}
      <div style={{
        opacity: addressOpacity,
        marginTop: 75,
        fontSize: 42,
        color: BRAND.accentColor,
        textAlign: 'center',
        zIndex: 2,
        background: 'rgba(0,0,0,0.65)',
        padding: '25px 50px',
        borderRadius: 25,
        border: '3px solid ' + BRAND.accentColor,
      }}>
        📍 ฉะเชิงเทรา | LINE: @300bsham
      </div>

      {/* CTA 按钮 */}
      <div style={{
        opacity: interpolate(frame, [55, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        marginTop: 55,
        background: 'linear-gradient(135deg, ' + BRAND.primaryColor + ', #FF8C42)',
        color: BRAND.textColor,
        fontSize: 46,
        fontWeight: 900,
        padding: '30px 70px',
        borderRadius: 60,
        zIndex: 2,
        boxShadow: '0 12px 50px rgba(255,107,27,0.6)',
        animation: 'glow 2s ease-in-out infinite',
      }}>
        มาเลย! 🚀
      </div>

      {/* 比心表情 */}
      <div style={{
        position: 'absolute',
        top: 140,
        right: 90,
        fontSize: 110,
        transform: `scale(${heartScale})`,
        zIndex: 2,
        animation: 'heartBeat 1s ease-in-out infinite',
      }}>
        ❤️
      </div>

      <style>{`
        @keyframes glow {
          0%, 100% { box-shadow: 0 12px 50px rgba(255,107,27,0.6); }
          50% { box-shadow: 0 12px 80px rgba(255,107,27,0.9), 0 0 120px rgba(255,107,27,0.5); }
        }
        @keyframes heartBeat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.25); }
        }
      `}</style>
    </div>
  );
};

// ============ MAIN COMPOSITION ============
export const FishpondFloodAd: React.FC = () => {
  const config = useVideoConfig();

  return (
    <AbsoluteFill style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif" }}>
      <Sequence from={SCENES.hook.start} durationInFrames={SCENES.hook.end - SCENES.hook.start}>
        <HookScene />
      </Sequence>
      <Sequence from={SCENES.complaint.start} durationInFrames={SCENES.complaint.end - SCENES.complaint.start}>
        <ComplaintScene />
      </Sequence>
      <Sequence from={SCENES.reward.start} durationInFrames={SCENES.reward.end - SCENES.reward.start}>
        <RewardScene />
      </Sequence>
      <Sequence from={SCENES.cta.start} durationInFrames={SCENES.cta.end - SCENES.cta.start}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
