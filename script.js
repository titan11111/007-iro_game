// 基本の油絵具精霊データ
const basicSpirits = [
    { name: "カドミウムレッド", rgb: [227, 38, 54], id: "cadmium_red" },
    { name: "ウルトラマリンブルー", rgb: [18, 10, 143], id: "ultramarine_blue" },
    { name: "カドミウムイエロー", rgb: [255, 237, 0], id: "cadmium_yellow" },
    { name: "バーントシエナ", rgb: [138, 54, 15], id: "burnt_sienna" },
    { name: "アイボリーブラック", rgb: [41, 36, 33], id: "ivory_black" },
    { name: "チタニウムホワイト", rgb: [255, 255, 255], id: "titanium_white" },
    { name: "ビリジャン", rgb: [64, 130, 109], id: "viridian" },
    { name: "バーントアンバー", rgb: [130, 102, 68], id: "burnt_umber" },
    { name: "アリザリンクリムゾン", rgb: [227, 38, 54], id: "alizarin_crimson" },
    { name: "コバルトブルー", rgb: [0, 71, 171], id: "cobalt_blue" },
    { name: "セルリアンブルー", rgb: [0, 150, 220], id: "cerulean_blue" },
    { name: "レモンイエロー", rgb: [255, 248, 0], id: "lemon_yellow" },
    { name: "イエローオーカー", rgb: [227, 171, 59], id: "yellow_ochre" }];

// ゲーム状態管理
let gameState = {
    selectedColors: [], // 選択された2色
    collection: [], // 図鑑に登録された精霊
    currentMixResult: null // 現在の混色結果
};

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    const bgm = document.getElementById('bgm');
    if (bgm) {
        bgm.volume = 0.5;
        bgm.play().catch(() => {});
    }
    initializeGame();
});

function initializeGame() {
    // 基本色を表示
    displayBasicColors();

    // 基本色を図鑑に追加
    basicSpirits.forEach(spirit => {
        addToCollection(spirit);
    });

    // イベントリスナー設定
    setupEventListeners();

    // 図鑑を更新
    updateCollection();
}

function displayBasicColors() {
    const basicColorsContainer = document.getElementById('basicColors');
    basicColorsContainer.innerHTML = '';

    basicSpirits.forEach(spirit => {
        const colorElement = createColorElement(spirit);
        basicColorsContainer.appendChild(colorElement);
    });
}

function createColorElement(spirit) {
    const colorDiv = document.createElement('div');
    colorDiv.className = 'color-item';
    colorDiv.style.backgroundColor = `rgb(${spirit.rgb.join(',')})`;
    colorDiv.draggable = true;
    colorDiv.dataset.spiritId = spirit.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'color-name';
    nameSpan.textContent = spirit.name;
    
    // 背景色の明度を計算して、テキストカラーを自動判定
    const brightness = (spirit.rgb[0] * 299 + spirit.rgb[1] * 587 + spirit.rgb[2] * 114) / 1000;
    nameSpan.style.color = brightness > 140 ? '#000000' : '#ffffff';
    
    colorDiv.appendChild(nameSpan);

    colorDiv.addEventListener('dragstart', handleDragStart);
    colorDiv.addEventListener('click', handleColorClick);

    return colorDiv;
}

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.spiritId);
}

function handleColorClick(e) {
    const spiritId = e.target.closest('.color-item').dataset.spiritId; // spanではなくdiv全体からidを取得
    const spirit = findSpiritById(spiritId);

    if (spirit && gameState.selectedColors.length < 2) {
        // 同じ色を複数選択できないようにする（必要であれば）
        if (!gameState.selectedColors.some(s => s.id === spirit.id)) {
            addSelectedColor(spirit);
        } else {
            alert('同じ精霊は複数選択できません！');
        }
    }
}

function addSelectedColor(spirit) {
    if (gameState.selectedColors.length < 2) {
        gameState.selectedColors.push(spirit);
        updateMixingSlots();
        displayGod(spirit);

        if (gameState.selectedColors.length === 2) {
            document.getElementById('mixButton').disabled = false;
        }
    }
}

function updateMixingSlots() {
    const slot1 = document.getElementById('slot1');
    const slot2 = document.getElementById('slot2');

    // スロットの内容をリセット
    slot1.style.backgroundColor = '';
    slot1.innerHTML = '<span>精霊1をドロップ</span>';
    slot1.classList.remove('active');
    slot2.style.backgroundColor = '';
    slot2.innerHTML = '<span>精霊2をドロップ</span>';
    slot2.classList.remove('active');
    document.getElementById('mixButton').disabled = true; // デフォルトで無効にする


    if (gameState.selectedColors[0]) {
        slot1.style.backgroundColor = `rgb(${gameState.selectedColors[0].rgb.join(',')})`;
        slot1.innerHTML = `<span class="slot-spirit-name">${gameState.selectedColors[0].name}</span>`;
        slot1.classList.add('active');
    }

    if (gameState.selectedColors[1]) {
        slot2.style.backgroundColor = `rgb(${gameState.selectedColors[1].rgb.join(',')})`;
        slot2.innerHTML = `<span class="slot-spirit-name">${gameState.selectedColors[1].name}</span>`;
        slot2.classList.add('active');
    }

    // 両方のスロットに精霊が入っていればボタンを有効化
    if (gameState.selectedColors.length === 2) {
        document.getElementById('mixButton').disabled = false;
    }
}


function setupEventListeners() {
    // 混色ボタン
    document.getElementById('mixButton').addEventListener('click', performMixing);

    // 名前決定ボタン
    document.getElementById('nameButton').addEventListener('click', nameNewSpirit);

    // ドロップゾーン設定
    setupDropZones();

    // エンターキーで名前決定
    document.getElementById('spiritName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            nameNewSpirit();
        }
    });
}

function setupDropZones() {
    const slots = [document.getElementById('slot1'), document.getElementById('slot2')];

    slots.forEach((slot, index) => {
        slot.addEventListener('dragover', e => e.preventDefault());
        slot.addEventListener('drop', e => {
            e.preventDefault();
            const spiritId = e.dataTransfer.getData('text/plain');
            const spirit = findSpiritById(spiritId);

            if (spirit) {
                // ドロップされたスロットに精霊がなければ、または既に選択されている精霊と異なる場合
                if (!gameState.selectedColors[index] || gameState.selectedColors[index].id !== spirit.id) {
                    // 他のスロットに同じ精霊が既に選択されていないかチェック
                    const otherIndex = index === 0 ? 1 : 0;
                    if (gameState.selectedColors[otherIndex] && gameState.selectedColors[otherIndex].id === spirit.id) {
                        alert('同じ精霊は複数選択できません！');
                        return;
                    }

                    gameState.selectedColors[index] = spirit;
                    updateMixingSlots();
                    displayGod(spirit);
                }
            }
        });

        // スロットクリックでリセット
        slot.addEventListener('click', () => {
            if (gameState.selectedColors[index]) {
                gameState.selectedColors.splice(index, 1);
                // 選択された色が減ったので、再度スロットの状態を更新
                updateMixingSlots();
                // 必要であれば混色ボタンを無効化
                if (gameState.selectedColors.length < 2) {
                    document.getElementById('mixButton').disabled = true;
                }
            }
        });
    });
}

function findSpiritById(id) {
    // 基本精霊から検索
    let spirit = basicSpirits.find(s => s.id === id);
    if (spirit) return spirit;

    // 図鑑から検索
    return gameState.collection.find(s => s.id === id);
}

function performMixing() {
    if (gameState.selectedColors.length !== 2) return;

    const color1 = gameState.selectedColors[0];
    const color2 = gameState.selectedColors[1];

    // 混色計算（単純平均）
    const mixedRgb = [
        Math.round((color1.rgb[0] + color2.rgb[0]) / 2),
        Math.round((color1.rgb[1] + color2.rgb[1]) / 2),
        Math.round((color1.rgb[2] + color2.rgb[2]) / 2)
    ];

    // 新しい精霊データ作成
    const newSpirit = {
        name: `${color1.name} × ${color2.name}の精霊`, // 仮の名前
        rgb: mixedRgb,
        id: `mixed_${Date.now()}`,
        parents: [color1.id, color2.id]
    };

    gameState.currentMixResult = newSpirit;

    // 結果表示
    showMixResult(newSpirit);
}

function showMixResult(spirit) {
    const resultArea = document.getElementById('resultArea');
    const newSpiritColor = document.getElementById('newSpiritColor');
    const spiritNameInput = document.getElementById('spiritName');

    newSpiritColor.style.backgroundColor = `rgb(${spirit.rgb.join(',')})`;
    spiritNameInput.value = ''; // 入力欄をクリア
    spiritNameInput.placeholder = '新しい名前を入力してね！'; // プレースホルダーを設定

    displayGod(spirit);
    resultArea.style.display = 'block';
    resultArea.scrollIntoView({ behavior: 'smooth' });
}

function displayGod(spirit) {
    const godDisplay = document.getElementById('godDisplay');
    const godName = document.getElementById('godName');
    if (godDisplay && godName) {
        godName.textContent = `${spirit.name}の神様が現れた！`;
        godDisplay.style.display = 'block';
    }
}

function nameNewSpirit() {
    const nameInput = document.getElementById('spiritName');
    const newName = nameInput.value.trim();

    if (!newName) {
        alert('精霊に名前をつけてあげてね！');
        return;
    }

    if (!gameState.currentMixResult) return;

    // 名前を設定
    gameState.currentMixResult.name = newName;

    // 図鑑に追加
    addToCollection(gameState.currentMixResult);

    // UI更新
    updateCollection();
    resetMixingArea();

    // 成功メッセージ
    alert(`「${newName}」が図鑑に登録されました！`);
}

function addToCollection(spirit) {
    // 重複チェック
    const exists = gameState.collection.find(s => s.id === spirit.id);
    if (!exists) {
        gameState.collection.push({...spirit});
        // 図鑑の並び順をIDでソート（常に同じ順序になるように）
        gameState.collection.sort((a, b) => a.id.localeCompare(b.id));
    }
}

function updateCollection() {
    const collectionGrid = document.getElementById('collectionGrid');
    collectionGrid.innerHTML = '';

    gameState.collection.forEach(spirit => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'collection-item';

        const colorDiv = document.createElement('div');
        colorDiv.className = 'collection-color';
        colorDiv.style.backgroundColor = `rgb(${spirit.rgb.join(',')})`;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'collection-name';
        nameDiv.textContent = spirit.name;

        const rgbDiv = document.createElement('div');
        rgbDiv.className = 'collection-rgb';
        rgbDiv.textContent = `RGB(${spirit.rgb.join(', ')})`;

        itemDiv.appendChild(colorDiv);
        itemDiv.appendChild(nameDiv);
        itemDiv.appendChild(rgbDiv);

        // クリックで混色エリアに追加
        itemDiv.addEventListener('click', () => {
            if (gameState.selectedColors.length < 2) {
                addSelectedColor(spirit);
            }
        });

        collectionGrid.appendChild(itemDiv);
    });
}

function resetMixingArea() {
    gameState.selectedColors = [];
    gameState.currentMixResult = null;

    const slot1 = document.getElementById('slot1');
    const slot2 = document.getElementById('slot2');
    const resultSlot = document.getElementById('resultSlot');
    const resultArea = document.getElementById('resultArea');

    slot1.style.backgroundColor = '';
    slot1.innerHTML = '<span>精霊1をドロップ</span>';
    slot1.classList.remove('active');

    slot2.style.backgroundColor = '';
    slot2.innerHTML = '<span>精霊2をドロップ</span>';
    slot2.classList.remove('active');

    resultSlot.innerHTML = '<span>？</span>';
    resultArea.style.display = 'none';

    document.getElementById('mixButton').disabled = true;
    document.getElementById('godDisplay').style.display = 'none';
}

// デバッグ用：コンソールでゲーム状態確認
window.debugGame = () => {
    console.log('Current Game State:', gameState);
    console.log('Basic Spirits:', basicSpirits);
};
