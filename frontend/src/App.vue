<template>
  <div id="app" class="app-container">
    <!-- 顶部导航栏 -->
    <header class="app-header">
      <div class="logo">
        <h1>🎵 LX Music Web</h1>
      </div>
      <nav class="nav-menu">
        <router-link to="/" class="nav-item">首页</router-link>
        <router-link to="/ranking" class="nav-item">排行榜</router-link>
        <router-link to="/search" class="nav-item">搜索</router-link>
        <router-link to="/download" class="nav-item">
          下载管理
          <span v-if="downloadingCount > 0" class="badge">{{ downloadingCount }}</span>
        </router-link>
        <router-link to="/settings" class="nav-item">设置</router-link>
      </nav>
    </header>

    <!-- 主内容区 -->
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 底部播放器 -->
    <footer class="app-footer" v-if="currentMusic">
      <div class="player-container">
        <div class="music-info">
          <img :src="currentMusic.pic || '/default-cover.png'" alt="封面" class="cover">
          <div class="info">
            <div class="name">{{ currentMusic.name }}</div>
            <div class="singer">{{ currentMusic.singer }}</div>
          </div>
        </div>

        <div class="player-controls">
          <button @click="previous" class="control-btn">⏮️</button>
          <button @click="togglePlay" class="control-btn play-btn">
            {{ isPlaying ? '⏸️' : '▶️' }}
          </button>
          <button @click="next" class="control-btn">⏭️</button>
        </div>

        <div class="player-progress">
          <span class="time">{{ formatTime(currentTime) }}</span>
          <input 
            type="range" 
            v-model="currentTime" 
            :max="duration" 
            @input="seek"
            class="progress-bar"
          >
          <span class="time">{{ formatTime(duration) }}</span>
        </div>

        <div class="player-volume">
          <button @click="toggleMute" class="control-btn">
            {{ isMuted ? '🔇' : '🔊' }}
          </button>
          <input 
            type="range" 
            v-model="volume" 
            min="0" 
            max="100" 
            class="volume-bar"
          >
        </div>
      </div>
    </footer>

    <!-- 全局加载提示 -->
    <div v-if="loading" class="global-loading">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { usePlayerStore } from './stores/player';
import { useDownloadStore } from './stores/download';

export default {
  name: 'App',
  setup() {
    const playerStore = usePlayerStore();
    const downloadStore = useDownloadStore();

    const loading = ref(false);
    const ws = ref(null);

    // 播放器状态
    const currentMusic = computed(() => playerStore.currentMusic);
    const isPlaying = computed(() => playerStore.isPlaying);
    const currentTime = computed({
      get: () => playerStore.currentTime,
      set: (val) => playerStore.currentTime = val
    });
    const duration = computed(() => playerStore.duration);
    const volume = computed({
      get: () => playerStore.volume,
      set: (val) => playerStore.setVolume(val)
    });
    const isMuted = computed(() => playerStore.isMuted);

    // 下载状态
    const downloadingCount = computed(() => {
      return downloadStore.downloads.filter(d => d.status === 'downloading').length;
    });

    // 播放器控制
    const togglePlay = () => playerStore.togglePlay();
    const previous = () => playerStore.previous();
    const next = () => playerStore.next();
    const seek = () => playerStore.seek(currentTime.value);
    const toggleMute = () => playerStore.toggleMute();

    // 格式化时间
    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return '00:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // WebSocket 连接
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/download`;
      
      ws.value = new WebSocket(wsUrl);

      ws.value.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.value.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'download_progress') {
            downloadStore.updateDownloadProgress(message.downloadId, message.data);
          }
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };

      ws.value.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.value.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 5000);
      };
    };

    // 生命周期
    onMounted(() => {
      playerStore.init();
      downloadStore.fetchDownloads();
      connectWebSocket();
    });

    onUnmounted(() => {
      if (ws.value) {
        ws.value.close();
      }
    });

    return {
      loading,
      currentMusic,
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
      downloadingCount,
      togglePlay,
      previous,
      next,
      seek,
      toggleMute,
      formatTime
    };
  }
};
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
}

.logo h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: bold;
}

.nav-menu {
  display: flex;
  gap: 2rem;
}

.nav-item {
  color: #fff;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.3s;
  position: relative;
}

.nav-item:hover {
  color: #ffd700;
}

.nav-item.router-link-active {
  color: #ffd700;
}

.badge {
  position: absolute;
  top: -8px;
  right: -12px;
  background: #ff4757;
  color: #fff;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 0.7rem;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.app-footer {
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  padding: 1rem 2rem;
}

.player-container {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.music-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 250px;
}

.cover {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
}

.info .name {
  font-weight: bold;
  margin-bottom: 4px;
}

.info .singer {
  font-size: 0.9rem;
  opacity: 0.8;
}

.player-controls {
  display: flex;
  gap: 1rem;
}

.control-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 1.5rem;
  cursor: pointer;
  transition: transform 0.2s;
}

.control-btn:hover {
  transform: scale(1.1);
}

.play-btn {
  font-size: 2rem;
}

.player-progress {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.progress-bar {
  flex: 1;
  height: 6px;
}

.time {
  font-size: 0.9rem;
  min-width: 45px;
}

.player-volume {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 150px;
}

.volume-bar {
  width: 100px;
}

.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
