class DiceRoller {
  constructor(diceResults) {
    this.form = document.getElementById("dice-form");

    this.template = {};
    this.template.element = document.getElementById("dice-box-template");
    this.template.box =
      this.template.element.content.querySelector(".dice-box");
    this.template.dice =
      this.template.element.content.querySelector(".roll-dice");
    this.template.value =
      this.template.element.content.querySelector(".roll-value");
    this.template.reason =
      this.template.element.content.querySelector(".roll-reason");
    this.template.result =
      this.template.element.content.querySelector(".roll-result");

    this.diceResults = diceResults;
    this.dicePattern = /\[dice\](.*?)\[\/dice\]/gi;
    this.diceArgs = ["count", "sides", "bonus", "reason"];
  }

  getErrorString(error) {
    return (
      '<div class="quote-box error" style="color: #c10000; font-weight: bold;">' +
      error +
      "</div>"
    );
  }

  initDiceBoxes() {
    let postList = document.querySelectorAll(".post, #post");
    let isPostPage = document.getElementById("pun-post") != null;

    for (let post of postList) {
      let paragraphList = post.querySelectorAll(".post-content p");
      this.gatherEntropy(post);

      for (let paragraph of paragraphList) {
        let string = paragraph.innerHTML;

        string = string.replace(this.dicePattern, (match, p1) => {
          let data = this.processBoxData(p1);

          if (post.id && isPostPage)
            return this.getErrorString(
              "РћС€РёР±РєР° РїРѕРёСЃРєР° СЌРЅС‚СЂРѕРїРёРё. РћРЅР° РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РІ РЅРµСЃСѓС‰РµСЃС‚РІСѓСЋС‰РёС… РїРѕСЃС‚Р°С…. РћС‚РїСЂР°РІСЊС‚Рµ РїРѕСЃС‚."
            );

          if (data.error !== undefined) return this.getErrorString(data.error);

          for (let i = 0; i < data.length; i++)
            this.template.box.dataset[data[i].name] = data[i].value;

          this.processBoxTemplate(post);

          return this.template.element.innerHTML;
        });

        paragraph.innerHTML = string;
      }
    }
  }

  gatherEntropy(post) {
    let entropy = "";

    if (post.classList.contains("post")) {
      // РЎС‚СЂР°РЅРёС†Р° С‚РµРјС‹
      const link = post.querySelector('h3 a[href*="#p"]');
      if (link) {
        entropy = link.href.match(/#p\d+/)?.[0] || "";
      }
    } else {
      // РЎС‚СЂР°РЅРёС†Р° РїРѕРёСЃРєР°
      const links = post.querySelectorAll('h3 a[href*="pid="]');
      for (let link of links) {
        const match = link.href.match(/pid=(\d+)/);
        if (match) {
          entropy = "#p" + match[1];
          break;
        }
      }
    }

    console.log("Seed entropy:", entropy || "[РїСѓСЃС‚Рѕ]");
    this.generator = new Math.seedrandom(entropy || "default");
  }

  rollDice(count, sides, bonus) {
    let result = 0;
    count = parseInt(count);
    sides = parseInt(sides);
    bonus = parseInt(bonus);

    for (let i = 0; i < count; i++)
      result += Math.floor(this.generator() * sides) + 1 + bonus;

    return result;
  }

  processBoxData(string) {
    let rawArray = string.split("|");
    let processedArray = [];

    if (rawArray[3] === undefined)
      return {
        error:
          "РћС€РёР±РєР° РѕР±СЂР°Р±РѕС‚РєРё РґР°РЅРЅС‹С…. РЁР°Р±Р»РѕРЅ Р±С‹Р» Р·Р°РїРѕР»РЅРµРЅ РЅРµ РїРѕР»РЅРѕСЃС‚СЊСЋ.",
      };

    for (let i = 0; i < rawArray.length; i++) {
      let property = {};
      rawArray[i] = rawArray[i].split("=");

      if (rawArray[i][1] === undefined)
        return {
          error:
            "РћС€РёР±РєР° РѕР±СЂР°Р±РѕС‚РєРё РґР°РЅРЅС‹С…. РЁР°Р±Р»РѕРЅ Р±С‹Р» СЂР°Р·РѕСЂРІР°РЅ.",
        };

      property.name = rawArray[i][0].replace(/\s/gi, "");

      if (property.name === "reason") property.value = rawArray[i][1];
      else property.value = rawArray[i][1].replace(/\D/gi, "");

      if (!this.diceArgs.includes(property.name))
        return {
          error:
            "РћС€РёР±РєР° РѕР±СЂР°Р±РѕС‚РєРё РґР°РЅРЅС‹С…. Р’ С€Р°Р±Р»РѕРЅРµ РїСЂРёСЃСѓС‚СЃС‚РІСѓРµС‚ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ Р°СЂРіСѓРјРµРЅС‚.",
        };

      if (property.value === "")
        return {
          error:
            "РћС€РёР±РєР° РѕР±СЂР°Р±РѕС‚РєРё РґР°РЅРЅС‹С…. РћРґРёРЅ РёР· Р°СЂРіСѓРјРµРЅС‚РѕРІ РЅРµ РёРјРµРµС‚ Р·РЅР°С‡РµРЅРёСЏ.",
        };

      processedArray.push(property);
    }

    return processedArray;
  }

  getRollResult(roll) {
    for (let i = 0; i < this.diceResults.length; i++) {
      if (roll <= this.diceResults[i].max) return this.diceResults[i].result;
    }
    return "";
  }

  processBoxTemplate(post) {
    let roll = this.rollDice(
      this.template.box.dataset.count,
      this.template.box.dataset.sides,
      this.template.box.dataset.bonus
    );

    this.template.dice.textContent = `${this.template.box.dataset.count}d${this.template.box.dataset.sides} + ${this.template.box.dataset.bonus}`;
    this.template.value.textContent = roll;
    this.template.reason.textContent = this.template.box.dataset.reason;
    this.template.result.textContent = this.getRollResult(roll);
  }
}
