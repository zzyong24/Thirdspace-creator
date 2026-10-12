
      const loader = document.getElementById('app-initial-loader')
      setTimeout(() => {
        const tip = loader?.querySelector('.timeout-tip')
        if (tip) {
          tip.style.display = 'block'
        }
      }, 30000)
    