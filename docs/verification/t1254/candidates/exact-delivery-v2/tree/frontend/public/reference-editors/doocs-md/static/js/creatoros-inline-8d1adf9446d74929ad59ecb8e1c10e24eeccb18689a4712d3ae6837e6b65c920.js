
      ;(function () {
        const LOCALE_KEY = 'locale'

        window.__MD_LOADER_TEXT__ = {
          'zh-CN': {
            tagline: '致力于让 Markdown 编辑更简单',
            loading: '正在加载编辑器',
            timeout: '加载时间过长，请尝试刷新页面或按 F12 查看控制台是否有异常信息',
            title: '微信 Markdown 编辑器 | Doocs',
            description: 'Wechat Markdown Editor | 一款高度简洁的微信 Markdown 编辑器',
          },
          'zh-TW': {
            tagline: '致力於讓 Markdown 編輯更簡單',
            loading: '正在載入編輯器',
            timeout: '載入時間過長，請嘗試重新整理頁面或按 F12 檢視控制台是否有異常資訊',
            title: '微信 Markdown 編輯器 | Doocs',
            description: 'Wechat Markdown Editor | 一款高度簡潔的微信 Markdown 編輯器',
          },
          'en-US': {
            tagline: 'Making Markdown editing simpler',
            loading: 'Loading editor',
            timeout:
              'Loading is taking too long. Try refreshing the page or press F12 to check the console for errors.',
            title: 'WeChat Markdown Editor | Doocs',
            description: 'Wechat Markdown Editor | A minimalist Markdown editor for WeChat Official Accounts',
          },
          'ja-JP': {
            tagline: 'Markdown 編集をもっとシンプルに',
            loading: 'エディターを読み込み中',
            timeout: '読み込みに時間がかかっています。ページを更新するか、F12 でコンソールのエラーを確認してください。',
            title: '微信 Markdown エディター | Doocs',
            description: 'Wechat Markdown Editor | 微信公式アカウント向けのシンプルな Markdown エディター',
          },
        }

        function normalizeLocale(value) {
          if (value === 'zh-CN' || value === 'zh-TW' || value === 'en-US' || value === 'ja-JP') return value
          if (typeof value === 'string') {
            const lower = value.toLowerCase()
            if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower.startsWith('zh-hant'))
              return 'zh-TW'
            if (lower.startsWith('zh')) return 'zh-CN'
            if (lower.startsWith('ja')) return 'ja-JP'
            if (lower.startsWith('en')) return 'en-US'
          }
          return null
        }

        function detectFromNavigator() {
          const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
          for (const language of languages) {
            const normalized = normalizeLocale(language)
            if (normalized) return normalized
          }
          return 'zh-CN'
        }

        function readLocaleFromLocalStorage() {
          try {
            return normalizeLocale(localStorage.getItem(LOCALE_KEY))
          } catch {
            return null
          }
        }

        window.__MD_APPLY_LOADER_LOCALE__ = function applyLoaderLocale(locale) {
          const text = window.__MD_LOADER_TEXT__[locale] || window.__MD_LOADER_TEXT__['zh-CN']
          document.documentElement.lang = locale
          document.title = text.title

          const description = document.querySelector('meta[name="description"]')
          if (description) description.setAttribute('content', text.description)

          const loader = document.getElementById('app-initial-loader')
          if (!loader) return

          const tagline = loader.querySelector('strong')
          const loading = loader.querySelector('.txt')
          const timeout = loader.querySelector('.timeout-tip')
          if (tagline) tagline.textContent = text.tagline
          if (loading) loading.textContent = text.loading
          if (timeout) timeout.textContent = text.timeout
        }

        window.__MD_BOOT_LOCALE__ = readLocaleFromLocalStorage() || detectFromNavigator()

        const theme = localStorage.getItem('vueuse-color-scheme') ?? 'auto'
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (theme === 'dark' || (theme === 'auto' && prefersDark)) {
          document.documentElement.classList.add('dark')
        }
      })()
    