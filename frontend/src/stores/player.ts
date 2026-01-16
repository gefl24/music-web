// frontend/src/stores/player.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface Music {
  id: string
  name: string
  singer: string
  album?: string
  pic?: string
  url: string
  source: string
}

export const usePlayerStore = defineStore('player', () => {
  // State
  const currentMusic = ref<Music | null>(null)
  const playlist = ref<Music[]>([])
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const volume = ref(80)
  const isMuted = ref(false)
  const audio = ref<HTMLAudioElement | null>(null)

  // Getters
  const hasNext = computed(() => currentIndex.value < playlist.value.length - 1)
  const hasPrevious = computed(() => currentIndex.value > 0)

  // Actions
  function init() {
    audio.value = new Audio()
    
    // 音频事件监听
    audio.value.addEventListener('loadedmetadata', () => {
      duration.value = audio.value?.duration || 0
    })

    audio.value.addEventListener('timeupdate', () => {
      currentTime.value = audio.value?.currentTime || 0
    })

    audio.value.addEventListener('ended', () => {
      next()
    })

    audio.value.addEventListener('error', (e) => {
      console.error('Audio error:', e)
      isPlaying.value = false
    })

    // 设置初始音量
    if (audio.value) {
      audio.value.volume = volume.value / 100
    }
  }

  function play(music?: Music) {
    if (music) {
      currentMusic.value = music
      if (audio.value) {
        audio.value.src = music.url
        audio.value.load()
      }
    }

    audio.value?.play()
    isPlaying.value = true
  }

  function pause() {
    audio.value?.pause()
    isPlaying.value = false
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  function next() {
    if (hasNext.value) {
      currentIndex.value++
      play(playlist.value[currentIndex.value])
    }
  }

  function previous() {
    if (hasPrevious.value) {
      currentIndex.value--
      play(playlist.value[currentIndex.value])
    }
  }

  function seek(time: number) {
    if (audio.value) {
      audio.value.currentTime = time
      currentTime.value = time
    }
  }

  function setVolume(val: number) {
    volume.value = val
    if (audio.value) {
      audio.value.volume = val / 100
    }
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
    if (audio.value) {
      audio.value.muted = isMuted.value
    }
  }

  function addToPlaylist(music: Music) {
    playlist.value.push(music)
  }

  function setPlaylist(list: Music[]) {
    playlist.value = list
  }

  function clearPlaylist() {
    playlist.value = []
    currentIndex.value = -1
  }

  return {
    // State
    currentMusic,
    playlist,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    // Getters
    hasNext,
    hasPrevious,
    // Actions
    init,
    play,
    pause,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    addToPlaylist,
    setPlaylist,
    clearPlaylist
  }
})
