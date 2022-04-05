module.exports = function (steward) {
    const version = 1;
    const author = 'WayneFerdon';
    const name = 'Tab Pro';
    const type = 'keyword';
    const icon = 'https://i.imgur.com/QcoukjA.png';
    const title = '管理标签页与窗口';
    const titleAttach = '合并标签页';
    const titleDetach = '移动标签页';
    const titleFocus = '跳转到标签页';
    const subtitleAttach = '将所有标签页合并到指定的窗口';
    const subtitleDetach = '查找并移动一个标签页到指定的窗口';
    const subtitleFocus = '查找并跳转到标签页';
    const commandAttach = {
        key: 'taba',
        type,
        title: titleAttach,
        subtitle: subtitleAttach,
        icon
    }
    const commandDetach = {
        key: 'tabd',
        type,
        title: titleDetach,
        subtitle: subtitleDetach,
        icon
    }
    const commandFocus = {
        key: 'tabf',
        type,
        title: titleFocus,
        subtitle: subtitleFocus,
        icon
    }
    const commands = [commandAttach, commandDetach, commandFocus];
    let curWinId;

    function detachSelectedTab(item) {
        chrome.tabs.getSelected(null, t => {
            if (t.id >= 0) {
                if (!item.id) {
                    chrome.windows.create({ tabId: t.id, focused: true })
                } else {
                    chrome.tabs.move(t.id, {
                        windowId: item.id,
                        index: item.tabIndex + 1
                    }, console.log)
                    updateTab(t.id, {
                        active: true
                    }, item.id);
                }
            }
        })
    }

    function getAllTabs(query) {
        return new Promise((resolve) => {
            chrome.windows.getAll({ populate: true }, function (wins) {
                if (wins.length) {
                    wins = wins.filter(win => win.id !== curWinId);
                    const tabs = wins.reduce((memo, win) => {
                        memo.push(...win.tabs)
                        return memo
                    }, [])

                    const results = tabs.filter(function (tab) {
                        return steward.util.matchText(query, `${tab.title}${tab.url}`);
                    });

                    resolve(results)
                } else {
                    resolve([]);
                }
            });
        })
    }

    function dataFormat(list) {
        return list.map(function (item, index) {
            let desc = commandFocus.subtitle;

            return {
                key: commandFocus.key,
                id: item.id,
                icon: item.favIconUrl || icon,
                title: titleFormat(item),
                // title: `[Win: ${item.windowId}]${titleFormat(item.title)}`,
                desc,
                isWarn: item.active,
                raw: item
            };
        });
    }

    function titleFormat(tab) {
        let title = tab.title;
        if (title == null) {
            title = '[未知新标签页或设置页面]';
        }
        return title;
    }

    function getOtherWindows() {
        return new Promise(resolve => {
            chrome.windows.getAll({ populate: true }, wins => {
                if (wins.length) {
                    let curWin;

                    curWin = wins.find(win => win.focused);

                    function getOthers() {
                        const otherWins = wins.filter(win => win.id !== curWin.id);
                        resolve(otherWins);
                    }

                    if (!curWin) {
                        // popup mode
                        chrome.windows.getCurrent({ populate: true }, result => {
                            curWin = result;
                            curWinId = curWin.id;
                            getOthers();
                        })
                    } else {
                        curWinId = curWin.id;
                        getOthers();
                    }
                } else {
                    resolve([]);
                }
            });
        });
    }

    function attachTabs() {
        chrome.windows.getAll({ populate: true }, wins => {
            if (wins.length) {
                let curTabs = [];
                let curWin;
                let otherTabs = [];

                wins.forEach(win => {
                    if (win.focused) {
                        curTabs = win.tabs;
                        curWin = win;
                    } else {
                        otherTabs = otherTabs.concat(win.tabs);
                    }
                });

                function moveTabs() {
                    let i = curTabs.length;

                    otherTabs.forEach(({ id: tabId }) => {
                        chrome.tabs.move(tabId, { windowId: curWin.id, index: i++ }, console.log)
                    })
                }

                if (curWin) {
                    moveTabs();
                } else {
                    // popup mode
                    chrome.windows.getLastFocused({ populate: true }, result => {
                        curWin = result;
                        curTabs = result.tabs;
                        moveTabs();
                    })
                }
            } else {
                steward.util.toast('Only one window');
            }
        });
    }

    function getOtherWindowsResult() {
        return getOtherWindows().then(wins => {
            return wins.map(win => {
                const tab = win.tabs.pop();
                tab.index = win.tabs.length;
                return {
                    id: win.id,
                    icon: tab.favIconUrl || icon,
                    title: titleFormat(tab),
                    desc: '移动到此窗口',
                    tabId: tab.id,
                    tabIndex: tab.index
                }
            });
        });
    }

    function updateWindow(winId, updateProperties) {
        return chrome.windows.update(winId, updateProperties);
    }

    function updateTab(id, updateProperties, winId) {
        if (updateProperties.active) {
            updateWindow(winId, {
                focused: true
            })
        }
        return chrome.tabs.update(id, updateProperties);
    }

    function activeOneTab(item) {
        updateTab(item.id, {
            active: true
        }, item.raw.windowId);
    }

    const defaultDetachResult = [
        {
            icon,
            title: '新窗口',
            desc: '移动到新窗口'
        }
    ];

    function onInput(query, command) {
        if (command.key === 'tabd') {
            return getOtherWindowsResult().then(items => {
                return defaultDetachResult.concat(items);
            });
        } else if (command.key === 'taba') {
            const result = steward.util.getDefaultResult(command);
            result[0].isDefault = false;
            return Promise.resolve(result);
        } else if (command.key === 'tabf') {
            return getOtherWindows().then(items => getAllTabs(query).then(tabs => {
                return dataFormat(tabs);
            }))
        }
    }

    function onEnter(item, command, query, shiftKey, list) {
        if (command.key === 'tabd') {
            detachSelectedTab(item);
        } else if (command.key === 'taba') {
            attachTabs();
        } else if (command.key === 'tabf') {
            activeOneTab(item);
        }
    }

    return {
        author,
        version,
        name,
        category: 'browser',
        icon,
        title,
        commands,
        onInput,
        onEnter
    };
}
