
import {
    AfterViewInit,
    Component,
    ContentChild,
    ContentChildren,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    QueryList,
    TemplateRef,
    ChangeDetectorRef, ViewEncapsulation
} from "@angular/core";
import {GwTabComponent} from "./tab.component";
import {GwTab} from "./tab";
import {typeofTemplateInput} from "../utils/template-input";
import {Observable} from "rxjs/Observable";
import {first} from "rxjs/operators";
import {DragulaService} from "ng-dragula";
import {Subscription} from "rxjs/Subscription";

export type TabOrTabComponent = GwTab | GwTabComponent;

let dragulaId: number = 0;

@Component({
    selector: 'gw-tabs',
    template: `        
        <div class="nav-tabs-custom tabs-{{position}}" [ngClass]="tabsType">
            <ng-template #tabs_header>
                <ng-container *ngFor="let tab of tabs">
                    <li [class.active]="tab.selected"
                        [class.disabled]="tab.disabled">
                        <a [class.disabled]="tab.disabled" (click)="_selectTab(tab)">
                            <ng-container *ngIf="_typeofContent(tab.title) === 'string'">
                                {{tab.title}}
                            </ng-container>
                            <ng-container *ngIf="_typeofContent(tab.title) === 'template'">
                                <ng-template [ngTemplateOutlet]="tab.title"></ng-template>
                            </ng-container>
                            <ng-container *ngIf="_typeofContent(tab.title) === 'component'">
                                <ng-container *ngComponentOutlet="tab.title;injector:tab.injector"></ng-container>
                            </ng-container>
                            <span *ngIf="tab.closable" (click)="_closeTab(tab, $event)"
                                  class="glyphicon glyphicon-remove-circle">
                            </span>
                        </a>
                    </li>
                </ng-container>
                <li class="pull-right" *ngIf="extra">
                    <ng-template [ngTemplateOutlet]="extra"></ng-template>
                </li>
            </ng-template>
            <ng-container *ngIf="sortable">
                <ul class="nav nav-tabs"
                    [dragula]="_dragula_key"
                    [dragulaModel]="tabs">
                    <ng-template [ngTemplateOutlet]="tabs_header"></ng-template>
                </ul>
            </ng-container>
            <ng-container *ngIf="!sortable">
                <ul class="nav nav-tabs">
                    <ng-template [ngTemplateOutlet]="tabs_header"></ng-template>
                </ul>
            </ng-container>
            <div class="tab-content no-padding">
                <ng-container *ngFor="let tab of tabs">
                    <div class="tab-pane" [class.active]="tab.selected">
                        <ng-container *ngIf="!tab._lazy || !tab.isFirstSelected">
                            <ng-container *ngIf="_typeofContent(tab.content) === 'string'">
                                {{tab.content}}
                            </ng-container>
                            <ng-container *ngIf="_typeofContent(tab.content) === 'template'">
                                <ng-template [ngTemplateOutlet]="tab.content"></ng-template>
                            </ng-container>
                            <ng-container *ngIf="_typeofContent(tab.content) === 'component'">
                                <ng-container *ngComponentOutlet="tab.content;injector:tab.injector"></ng-container>
                            </ng-container>
                        </ng-container>
                    </div>
                </ng-container>
            </div>
        </div>
    `,
    encapsulation: ViewEncapsulation.None,
    styleUrls: ['../styles/glowworm.css', './tabs.css'],
})
export class GwTabsComponent implements OnInit, AfterViewInit, OnDestroy {

    /**
     * 存储排序的key
     */
    @Input() storeKey: string;
    /**
     * 存储排序的模式 local --> localStorage  |  remote --> 服务器存储
     */
    @Input() storeType: 'local' | 'remote';
    @Input() position: 'top' | 'bottom' | 'left' | 'right' = 'top';

    @Input() tabsType: 'dashed'|'normal'|'none'|'' = '';
    /**
     * 是否启用排序
     */
    @Input() sortable: boolean = false;

    /**
     * 关闭前触发的事件
     */
    @Input() onClosing: (tab: TabOrTabComponent) => Observable<boolean>;

    @Output() onClose: EventEmitter<TabOrTabComponent> = new EventEmitter();
    @Output() onSelect: EventEmitter<TabOrTabComponent> = new EventEmitter();
    @Output() onUnSelect: EventEmitter<TabOrTabComponent> = new EventEmitter();
    @Output() onAdd: EventEmitter<TabOrTabComponent> = new EventEmitter();
    @Output() onSortStart: EventEmitter<void> = new EventEmitter<void>();
    @Output() onSort: EventEmitter<void> = new EventEmitter<void>();
    /**
     * 每次tab排序发生变化时触发
     */
    @Output() onOrderChange: EventEmitter<{ tabId: any }[]> = new EventEmitter();

    @Input() extra: TemplateRef<any>;
    @ContentChild('extra') _extra: TemplateRef<any>;

    @ContentChildren(GwTabComponent)
    tabComponents: QueryList<GwTabComponent>;
    tabsSub: Subscription;


    tabs: TabOrTabComponent[] = [];
    _dragula_key = `gwtabs_${++dragulaId}`;
    _store_prefix = 'gwtabs_';

    constructor(private dragulaService: DragulaService, private cdf: ChangeDetectorRef) {
        dragulaService.drop.subscribe((value) => {
            this.onSort.emit();
            this._onOrderChangeEvent();
        });

        dragulaService.drag.subscribe((value) => {
            this.onSortStart.emit();
        });

        dragulaService.cancel.subscribe((value) => {
            this.onSort.emit();
        });
    }

    ngOnInit() {
        this.extra = this.extra || this._extra;
    }

    ngAfterViewInit(): void {
        let comps = this.tabComponents.toArray();
        this.tabs.push(...comps);

        let selected = this.tabs.filter(tab => tab.selected);
        if (selected.length == 0) { //如果不存在选择的，则默认选中第一个
            if (this.tabs.length > 0) {
                let first = this.tabs[0];
                first.selected = true;
            }
        }

        if (selected.length > 1) { //如果存在多个选择的，则默认只能有一个选中的
            selected.forEach((tab, index) => {
                if (index != 0) {
                    tab.selected = false;
                }
            });
        }

        if (this.storeKey && this.storeType == 'local' && window.localStorage) {
            let json = window.localStorage.getItem(`${this._store_prefix}${this.storeKey}`);
            if (json) {
                let arr = JSON.parse(json);
                this.sortTabs(arr);
            }
        }

        this.tabsSub = this.tabComponents.changes.subscribe(() => {
            this.tabs = [
                ...this.tabComponents.toArray(),
                ...this.tabs.filter((tab) => (tab instanceof GwTab))
            ];
            this._checkAndSelect();
        });
        this.cdf.detectChanges()
        console.log(this.tabs)
    }

    /**
     * 添加tab页
     */
    addTab(tab: TabOrTabComponent) {
        if (tab.selected) {
            this.tabs.forEach(tab => {
                if (tab.selected) {
                    tab.selected = false;
                    this.onUnSelect.emit(tab);
                }
            });
            this.tabs.push(tab);
            this.onAdd.emit(tab);
            tab.selected = true;
            this.onSelect.emit(tab);
        } else {
            this.tabs.push(tab);
            this.onAdd.emit(tab);
        }

        this._onOrderChangeEvent();
    }

    /**
     * 插入tab页
     */
    insertTab(index: number, tab: TabOrTabComponent) {
        if (tab.selected) {
            this.tabs.forEach(tab => {
                if (tab.selected) {
                    tab.selected = false;
                    this.onUnSelect.emit(tab);
                }
            });
            this.tabs.splice(index, 0, tab);
            this.onAdd.emit(tab);
            tab.selected = true;
            this.onSelect.emit(tab);
        } else {
            this.tabs.splice(index, 0, tab);
            this.onAdd.emit(tab);
        }

        this._onOrderChangeEvent();
    }

    /**
     * 禁用tab页
     */
    disabledTab(tabId: any) {
        this.tabs.forEach(tab => {
            if (tab.tabId == tabId) {
                tab.disabled = true;
            }
        });
    }

    /**
     * 启用tab页
     */
    enabledTab(tabId: any) {
        this.tabs.forEach(tab => {
            if (tab.tabId == tabId) {
                tab.disabled = false;
            }
        });
    }

    /**
     * 选中tab页
     */
    selectTab(tabId: any) {
        this.tabs.forEach(tab => {
            if (tab.tabId == tabId) {
                this._selectTab(tab);
            }
        });
    }

    /**
     * 关闭tab页
     */
    closeTab(tabId: any) {
        this.tabs.forEach(tab => {
            if (tab.tabId == tabId) {
                this._closeTab(tab);
            }
        });

        this._onOrderChangeEvent();
    }

    clear() {
        let tabIds = this.tabs.map(tab => tab.tabId);
        tabIds.forEach(tabId => {
            this.closeTab(tabId);
        });
    }

    /**
     * 获取当前选中的tab页
     */
    getSelected(): TabOrTabComponent {
        let selected = this.tabs.filter(tab => tab.selected);
        return selected.length > 0 ? selected[0] : null;
    }

    /**
     * 为tab页排序
     */
    sortTabs(orders: { tabId: any }[]) {
        if (orders.length != this.tabs.length) return;

        let dist = [];
        orders.forEach((_tab) => {
            for (let i = 0; i < this.tabs.length; i++) {
                let tab = this.tabs[i];
                if (_tab.tabId == tab.tabId) {
                    dist.push(tab);
                    break;
                }
            }
        });

        if (dist.length != this.tabs.length) return;
        this.tabs = dist;
    }

    /**
     * @inner
     */
    _typeofContent(content: string): string {
        return typeofTemplateInput(content);
    }

    /**
     * @inner
     */
    _selectTab(tab: TabOrTabComponent) {
        let selected = this.tabs.filter(tab => tab.selected);
        if (tab == selected || tab.disabled) {
            return;
        }
        if (selected.length > 0) {
            selected.forEach(select => {select.selected = false;this.onUnSelect.emit(select)})
        }

        tab.isFirstSelected = false;
        tab.selected = true;
        this.onSelect.emit(tab);
    }

    /**
     * @inner
     */
    _closeTab(tab: TabOrTabComponent, event?: Event) {
        event && event.stopPropagation();
        let indexOf = this.tabs.indexOf(tab);
        if (tab.selected) {
            const subscribeFn = (closed: boolean) => {
                if (closed) {
                    this.tabs.splice(indexOf, 1);
                    this.onClose.emit(tab);
                    this._checkAndSelect();
                }
            };

            this.onUnSelect.emit(tab);
            this.onClosing ? this.onClosing(tab).pipe(first()).subscribe(subscribeFn) : subscribeFn(true);
        } else {
            const subscribeFn = (closed: boolean) => {
                if (closed) {
                    this.tabs.splice(indexOf, 1);
                    this.onClose.emit(tab);
                }
            };

            this.onClosing ? this.onClosing(tab).pipe(first()).subscribe(subscribeFn) : subscribeFn(true);
        }
    }

    _checkAndSelect() {
        let filtered = this.tabs.filter(tab => !tab.disabled);
        if (filtered.length > 0) {
            let firstTab = filtered[0];
            firstTab.selected = true;
            this.onSelect.emit(firstTab);
        }
    }

    /**
     * @inner
     */
    _onOrderChangeEvent() {
        let tabIds = this.tabs.map(tab => {
            return {tabId: tab.tabId};
        });

        if (this.storeKey && this.storeType == 'local' && window.localStorage) {
            let json = JSON.stringify(tabIds);
            window.localStorage.setItem(`${this._store_prefix}${this.storeKey}`, json);
        }

        this.onOrderChange.emit(tabIds);
    }

    /**
     * @inner
     */
    ngOnDestroy() {
        this.tabsSub && this.tabsSub.unsubscribe();
        if (this.sortable) {
            this.dragulaService.destroy(this._dragula_key);
        }
    }
}