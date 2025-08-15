(() => {
  //Трекер эпизодов
  const ALLOWED_GROUP_IDS = new Set([1, 2, 5]);
  const ONE_DAY = 86400000;
  const MAX_PARTICIPANTS = 10;
  const INSERT_AFTER_SELECTOR = "";

  if (!ALLOWED_GROUP_IDS.has(window.GroupID)) return;

  const select = (selector, root = document) => root.querySelector(selector);
  const selectAll = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const normalize = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const isSame = (a, b) => a === b || a.startsWith(b) || b.startsWith(a);
  const copyText = (text) => navigator.clipboard?.writeText(text);

  const store = {
    STORAGE_KEY_EPISODES: "forumEpisodes",
    STORAGE_KEY_LAST_REFRESH: "forumEpisodesLastRefresh",
    get episodes() {
      return JSON.parse(
        localStorage.getItem(this.STORAGE_KEY_EPISODES) || "[]"
      );
    },
    set episodes(value) {
      localStorage.setItem(this.STORAGE_KEY_EPISODES, JSON.stringify(value));
    },
    get lastRefreshStamp() {
      return +localStorage.getItem(this.STORAGE_KEY_LAST_REFRESH) || 0;
    },
    set lastRefreshStamp(value) {
      localStorage.setItem(this.STORAGE_KEY_LAST_REFRESH, String(value));
    },
  };

  const fetchTopicMeta = (domain, id) =>
    fetch(
      `${domain}/api.php?method=topic.get&topic_id=${id}&fields=subject,title,num_replies,last_username&format=json`
    )
      .then((response) => response.json())
      .then((json) => {
        const item = json?.response?.[0] || {};
        return {
          title: item.subject ?? item.title ?? null,
          replies: +item.num_replies || 0,
          last: item.last_username ?? null,
        };
      })
      .catch(() => ({ title: null, replies: 0, last: null }));

  const parseUrl = (urlString) => {
    try {
      const url = new URL(urlString);
      if (url.pathname.endsWith("viewtopic.php")) {
        const id = url.searchParams.get("id");
        if (id) return { id: +id, domain: url.origin };
      }
    } catch {}
    return null;
  };

  const anchorSelector = INSERT_AFTER_SELECTOR || "#h-uploads";
  const waitForAnchor = (resolve) => {
    const el = select(anchorSelector);
    if (el) return resolve(el);
    new MutationObserver((_, obs) => {
      const found = select(anchorSelector);
      if (found) {
        obs.disconnect();
        resolve(found);
      }
    }).observe(document.body, { childList: true, subtree: true });
  };

  (document.readyState === "loading"
    ? new Promise(waitForAnchor)
    : Promise.resolve(select(anchorSelector) || new Promise(waitForAnchor))
  ).then(initializeUI);

  function initializeUI(anchor) {
    anchor.insertAdjacentHTML(
      "afterend",
      `<li id="h-episodes"><a href="#" id="episodesOpenBtn">Эпизоды</a></li>`
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="modal" id="episodesModal">
          <div class="modal-content">
            <div class="top-bar">
              <button id="exportBtn">Экспорт</button>
              <button id="importBtn">Импорт</button>
              <button class="close-btn" id="closeX" title="Закрыть">&times;</button>
            </div>
            <h2 class="tracker-header">Трекер эпизодов</h2>
            <div id="episodesList" class="episodes-list"><p>Пока нет эпизодов…</p></div>
            <form id="episodeForm" class="add-episode-form" style="display:none;">
              <label>Ссылка на эпизод:
                <input type="url" id="episodeUrl" required placeholder="https://...">
              </label>
              <div id="participantsBox">
                <label>Участник 1:<input type="text" name="participant" required placeholder="Имя игрока (по очередности отписи)"></label>
              </div>
              <button type="button" id="addParticipantBtn">Новый участник</button>
              <button type="submit" id="saveEpisodeBtn">Добавить эпизод</button>
            </form>
            <div class="modal-actions primary-row">
              <button id="refreshBtn" title="Обновить">&#x21bb;</button>
              <button id="showFormBtn">Новый эпизод</button>
            </div>
          </div>
        </div>
      `
    );

    const elements = {
      modal: select("#episodesModal"),
      openButton: select("#episodesOpenBtn"),
      closeButton: select("#closeX"),
      listContainer: select("#episodesList"),
      refreshButton: select("#refreshBtn"),
      exportButton: select("#exportBtn"),
      importButton: select("#importBtn"),
      form: select("#episodeForm"),
      urlInput: select("#episodeUrl"),
      participantsBox: select("#participantsBox"),
      addParticipantButton: select("#addParticipantBtn"),
      showFormButton: select("#showFormBtn"),
      saveButton: select("#saveEpisodeBtn"),
    };

    let participantCount = 1;
    let editIndex = -1;

    function resetForm() {
      participantCount = 1;
      editIndex = -1;
      elements.addParticipantButton.disabled = false;
      elements.urlInput.value = "";
      while (elements.participantsBox.children.length > 1) {
        elements.participantsBox.lastChild.remove();
      }
      select("input", elements.participantsBox).value = "";
      elements.form.style.display = "none";
      elements.showFormButton.style.display = "";
      elements.saveButton.textContent = "Добавить";
    }

    elements.openButton.addEventListener("click", async (e) => {
      e.preventDefault();
      elements.modal.style.display = "block";
      if (Date.now() - store.lastRefreshStamp > ONE_DAY) {
        elements.listContainer.textContent = "Автообновление…";
        await refreshEpisodes();
        store.lastRefreshStamp = Date.now();
      } else {
        renderEpisodes();
      }
    });

    elements.closeButton.addEventListener("click", () => {
      elements.modal.style.display = "none";
      resetForm();
    });

    window.addEventListener("click", (e) => {
      if (e.target === elements.modal) {
        elements.modal.style.display = "none";
        resetForm();
      }
    });

    elements.showFormButton.addEventListener("click", () => {
      elements.form.style.display = "flex";
      elements.showFormButton.style.display = "none";
      setTimeout(() => elements.urlInput.focus(), 20);
    });

    elements.addParticipantButton.addEventListener("click", () => {
      if (participantCount >= MAX_PARTICIPANTS) return;
      const lastInput = elements.participantsBox.querySelector(
        "label:last-child input"
      );
      if (!lastInput.value.trim()) {
        lastInput.focus();
        return;
      }
      participantCount++;
      elements.participantsBox.insertAdjacentHTML(
        "beforeend",
        `<label>Участник ${participantCount}:<input type="text" name="participant"></label>`
      );
      if (participantCount >= MAX_PARTICIPANTS) {
        elements.addParticipantButton.disabled = true;
      }
    });

    elements.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = elements.urlInput.value.trim();
      const inputs = selectAll("input", elements.participantsBox);
      const participants = inputs.map((i) => i.value.trim()).filter(Boolean);
      if (!url || !participants.length)
        return alert("Заполните ссылку и участников");

      const info = parseUrl(url);
      const topicId = info?.id ?? null;
      const domain = info?.domain ?? null;

      const duplicate = store.episodes.some(
        (ep, i) =>
          (topicId ? ep.topicId === topicId : ep.url === url) && i !== editIndex
      );
      if (duplicate) return alert("Такой эпизод уже есть");

      let meta = { title: null, replies: 0, last: null };
      if (topicId && domain) meta = await fetchTopicMeta(domain, topicId);

      const newEpisode = {
        url,
        participants,
        last_username: meta.last,
        subject: meta.title,
        num_replies: meta.replies,
        topicId,
        domain,
      };

      const episodeArray = store.episodes;
      if (editIndex === -1) {
        episodeArray.push(newEpisode);
      } else {
        Object.assign(episodeArray[editIndex], newEpisode);
      }
      store.episodes = episodeArray;
      renderEpisodes();
      resetForm();
    });

    elements.refreshButton.addEventListener("click", async () => {
      elements.listContainer.textContent = "Обновление…";
      await refreshEpisodes();
      store.lastRefreshStamp = Date.now();
    });

    async function refreshEpisodes() {
      const episodeArray = store.episodes;
      for (let ep of episodeArray) {
        if (ep.topicId && ep.domain) {
          const m = await fetchTopicMeta(ep.domain, ep.topicId);
          ep.last_username = m.last;
          ep.num_replies = m.replies;
          ep.subject = m.title;
        }
      }
      store.episodes = episodeArray;
      renderEpisodes();
    }

    elements.exportButton.addEventListener("click", () => {
      copyText(JSON.stringify(store.episodes, null, 2));
    });

    elements.importButton.addEventListener("click", () => {
      const input = prompt("Вставьте экспортированные данные:");
      if (!input) return;
      let data;
      try {
        data = JSON.parse(input);
        if (!Array.isArray(data)) throw 0;
      } catch {
        return alert("Неверный формат");
      }
      const episodeArray = store.episodes;
      let added = 0;
      let skipped = 0;
      data.forEach((item) => {
        const exists = episodeArray.some(
          (e) =>
            (item.topicId && e.topicId === item.topicId) ||
            (!item.topicId && e.url === item.url)
        );
        if (exists) skipped++;
        else {
          episodeArray.push(item);
          added++;
        }
      });
      store.episodes = episodeArray;
      renderEpisodes();
      alert(`Импорт: добавлено ${added}, повторов исключено ${skipped}`);
    });

    elements.listContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".episode-action");
      if (!btn) return;
      const idx = +btn.closest(".episode").dataset.i;
      if (btn.classList.contains("episode-remove")) {
        if (confirm("Удалить эпизод?")) {
          const arr = store.episodes;
          arr.splice(idx, 1);
          store.episodes = arr;
          renderEpisodes();
        }
      } else {
        startEdit(idx);
      }
    });

    function startEdit(idx) {
      const episode = store.episodes[idx];
      editIndex = idx;
      elements.urlInput.value = episode.url;
      elements.participantsBox.innerHTML = "";
      episode.participants.forEach((p, i) => {
        elements.participantsBox.insertAdjacentHTML(
          "beforeend",
          `<label>Участник ${
            i + 1
          }:<input type="text" name="participant" value="${p}" ${
            !i ? "required" : ""
          }></label>`
        );
      });
      participantCount = episode.participants.length;
      elements.addParticipantButton.disabled =
        participantCount >= MAX_PARTICIPANTS;
      elements.form.style.display = "flex";
      elements.showFormButton.style.display = "none";
      elements.saveButton.textContent = "Сохранить";
      setTimeout(() => elements.urlInput.focus(), 20);
    }

    function renderEpisodes() {
      const episodeArray = store.episodes;
      if (!episodeArray.length) {
        elements.listContainer.innerHTML = "<p>Эпизодов нет…</p>";
        return;
      }
      const currentUser = normalize(window.UserLogin || "");
      elements.listContainer.innerHTML = episodeArray
        .map((ep, i) => {
          const arrNorm = ep.participants.map(normalize);
          const lastIdx = arrNorm.findIndex((n) =>
            isSame(n, normalize(ep.last_username || ""))
          );
          const meIdx = arrNorm.findIndex((n) => isSame(n, currentUser));
          const alertFlag =
            ep.num_replies > 0 &&
            lastIdx !== -1 &&
            meIdx !== -1 &&
            (lastIdx + 1) % arrNorm.length === meIdx;
          return `<div class="episode${
            alertFlag ? " episode-alert" : ""
          }" data-i="${i}">
            <div class="episode-actions">
              <button class="episode-action episode-edit"   title="Редактировать">✎</button>
              <button class="episode-action episode-remove" title="Удалить">×</button>
            </div>
            <div><b>Название эпизода:</b> <a href="${
              ep.url
            }" target="_blank" rel="noopener">${ep.subject || ep.url}</a></div>
            <div><b>Участники:</b> ${ep.participants
              .map((n) => `<span class="participant">${n}</span>`)
              .join(", ")}</div>
            <div><b>Последний пост:</b> ${
              ep.last_username ||
              '<span class="last-username-empty">Нет данных</span>'
            }</div>
          </div>`;
        })
        .join("");
    }

    renderEpisodes();
  }
})();
