module.exports = function (steward) {
    // Keys to call the plugin
    // Key to attach page
    const KEY_ATTACH = 'taba';
    // Key to detach page
    const KEY_DETACH = 'tabd';
    // Key to focus on page
    const KEY_FOCUS = 'tabf';

    // ---------Text of the plugin---------
    // Title of the plugin:
    // 'Manage tabs and windows'
    const TITLE = '管理标签页与窗口';
    // Title of tabs with unknow title (while the tab is a chrome setting page):
    // '[Unknown Title NewTab or Chrome Steeing Pages]'
    const UNKNOW_TAB_TITLE = '[未知标题新标签页或设置页面]';
    // Title of attach page:
    // 'Attach Tab'
    const TITLE_ATTACH = '合并标签页';
    // Title of detach page:
    // 'Detach and move Tab'
    const TITLE_DETACH = '移动标签页';
    // Title of focus on page:
    // 'Focus on Tab'
    const TITLE_FOCUS = '跳转到标签页';
    // Title of detach to new window:
    // 'New Window'
    const TITLE_NEW_WINDOW = '新窗口';
    // Title while current only exist one window:
    // 'Only one window exist'
    const TITLE_ONLY_ONE_WINDOW = '当前只有一个窗口'
    // Subtitle of attach page:
    // 'Move all tabs to current window'
    const SUBTITLE_ATTACH = '将所有标签页合并到指定的窗口';
    // Subtitle of attach page:
    // 'Detach current tab from current window and attach to another window'
    const SUBTITLE_DETACH = '查找并移动一个标签页到指定的窗口';
    // Subtitle of attach page:
    // 'Search and focus on a tab'
    const SUBTITLE_FOCUS = '查找并跳转到标签页';
    // Subtitle of detach to new window:
    // 'Detach current tab to new window'
    const SUBTITLE_NEW_WINDOW = '移动到新窗口';

    // -------Plugin Core Functions--------
    let CurrentWindowId;
    let CurrentTabs = [];
    let CurrendWindow;
    let OtherTabs = [];

    function DetachSelectedTab(item) {
        chrome.tabs.getSelected(null, tab => {
            if (tab.id < 0) {
                return
            }
            if (!item.id) {
                chrome.windows.create({ tabId: tab.id, focused: true })
                return
            }
            chrome.tabs.move(
                tab.id,
                { windowId: item.id, index: item.tabIndex + 1 },
                console.log
            )
            UpdateTab(tab.id, { active: true }, item.id);
        })
    }

    function GetAllTabs(query) {
        return new Promise((resolve) => {
            chrome.windows.getAll(
                { populate: true },
                function (wins) {
                    if (!wins.length) {
                        resolve([]);
                        return
                    }
                    wins = wins.filter(win => win.id !== CurrentWindowId);
                    const tabs = wins.reduce((memo, win) => {
                        memo.push(...win.tabs)
                        return memo
                    }, [])
                    const results = tabs.filter(function (tab) {
                        return steward.util.matchText(query, `${tab.title}${tab.url}`);
                    });
                    resolve(results)
                }
            );
        })
    }

    function FormatData(list) {
        return list.map(function (item, index) {
            // let desc = CommandFocus.subtitle;
            return {
                key: CommandFocus.key,
                id: item.id,
                icon: item.favIconUrl || PLUGIN_ICON,
                title: TitleFormat(item),
                desc: CommandFocus.subtitle,
                isWarn: item.active,
                raw: item
            };
        });
    }

    function TitleFormat(tab) {
        if (tab.title == null) {
            return UNKNOW_TAB_TITLE;
        }
        return tab.title;
    }

    function GetOtherWindows() {
        return new Promise(resolve => {
            chrome.windows.getAll({ populate: true }, wins => {
                function getOthers() {
                    const otherWins = wins.filter(win => win.id !== CurrendWindow.id);
                    resolve(otherWins);
                }

                if (!wins.length) {
                    resolve([]);
                    return
                }
                CurrendWindow = wins.find(win => win.focused);
                if (CurrendWindow) {
                    CurrentWindowId = CurrendWindow.id;
                    getOthers();
                    return
                }
                chrome.windows.getCurrent({ populate: true }, result => {
                    CurrendWindow = result;
                    CurrentWindowId = CurrendWindow.id;
                    getOthers();
                })
            });
        });
    }

    function AttachTabs() {
        chrome.windows.getAll({ populate: true }, wins => {
            function moveTabs() {
                let tabCount = CurrentTabs.length;
                OtherTabs.forEach(({ id: tabId }) => {
                    chrome.tabs.move(tabId, { windowId: CurrendWindow.id, index: tabCount++ }, console.log)
                })
            }

            if (!wins.length) {
                steward.util.toast(TITLE_ONLY_ONE_WINDOW);
                return
            }

            wins.forEach(win => {
                if (!win.focused) {
                    OtherTabs = OtherTabs.concat(win.tabs);
                    return
                }
                CurrentTabs = win.tabs;
                CurrendWindow = win;
            });

            if (CurrendWindow) {
                moveTabs();
                return
            }
            chrome.windows.getLastFocused({ populate: true }, result => {
                CurrendWindow = result;
                CurrentTabs = result.tabs;
                moveTabs();
            })
        });
    }

    function GetOtherWindowsResult() {
        return GetOtherWindows().then(wins => {
            return wins.map(win => {
                const tab = win.tabs.pop();
                tab.index = win.tabs.length;
                return {
                    id: win.id,
                    icon: tab.favIconUrl || PLUGIN_ICON,
                    title: TitleFormat(tab),
                    desc: '移动到此窗口',
                    tabId: tab.id,
                    tabIndex: tab.index
                }
            });
        });
    }

    function UpdateWindow(windowId, updateProperties) {
        return chrome.windows.update(windowId, updateProperties);
    }

    function UpdateTab(id, updateProperties, windowId) {
        if (updateProperties.active) {
            UpdateWindow(windowId, {
                focused: true
            })
        }
        return chrome.tabs.update(id, updateProperties);
    }

    function ActiveTab(item) {
        UpdateTab(item.id, {
            active: true
        }, item.raw.windowId);
    }

    function OnInput(query, command) {
        switch (command.key) {
            case KEY_ATTACH:
                const result = steward.util.getDefaultResult(command);
                result[0].isDefault = false;
                return Promise.resolve(result);
            case KEY_DETACH:
                return GetOtherWindowsResult().then(
                    items => {
                        return DEFAULT_DETACH_RESULT.concat(items);
                    });
            case KEY_FOCUS:
                return GetOtherWindows().then(
                    items => GetAllTabs(query).then(tabs => {
                        return FormatData(tabs);
                    }))
            default:
                return;
        }
    }

    function OnEnter(item, command, query, shiftKey, list) {
        switch (command.key) {
            case KEY_ATTACH:
                AttachTabs();
                break;
            case KEY_DETACH:
                DetachSelectedTab(item);
                break;
            case KEY_FOCUS:
                ActiveTab(item);
                break;
            default:
                break;
        }
    }

    // CONSTANTS
    const VERSION = 1;
    const AUTHOR = 'WayneFerdon';
    const PLUGIN_NAME = 'Tab Pro';
    const PLUGIN_TYPE = 'keyword';
    const PLUGIN_CATEGORY = 'browser';
    const PLUGIN_ICON = 'https://i.imgur.com/QcoukjA.png';
    const DEFAULT_DETACH_RESULT = [
        {
            icon: PLUGIN_ICON,
            title: TITLE_NEW_WINDOW,
            desc: SUBTITLE_NEW_WINDOW
        }
    ];
    const CommandAttach = {
        key: KEY_ATTACH,
        type: PLUGIN_TYPE,
        title: TITLE_ATTACH,
        subtitle: SUBTITLE_ATTACH,
        icon: PLUGIN_ICON
    }
    const CommandDetach = {
        key: KEY_DETACH,
        type: PLUGIN_TYPE,
        title: TITLE_DETACH,
        subtitle: SUBTITLE_DETACH,
        icon: PLUGIN_ICON
    }
    const CommandFocus = {
        key: KEY_FOCUS,
        type: PLUGIN_TYPE,
        title: TITLE_FOCUS,
        subtitle: SUBTITLE_FOCUS,
        icon: PLUGIN_ICON
    }

    return {
        author: AUTHOR,
        version: VERSION,
        name: PLUGIN_NAME,
        category: PLUGIN_CATEGORY,
        icon: PLUGIN_ICON,
        title: TITLE,
        commands: [CommandAttach, CommandDetach, CommandFocus],
        onInput: OnInput,
        onEnter: OnEnter
    };
}
