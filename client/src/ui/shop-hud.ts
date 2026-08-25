import type { World } from '../../../shared/sim/world.ts';
import type { Ship } from '../../../shared/sim/entities/ship.ts';
import type { InputController } from '../input/input-controller.ts';
import type { Keybindings } from '../input/keybindings.ts';
import { Items, Slots, LOCK_MISSILE_MAX_LEVEL, lockMissilePrice } from '../../../shared/sim/combat-economy.ts';

export interface ShopNet { sendSell(): void; sendRepair(): void; sendBuy(itemId: number): void; sendEquip(slot: number, itemId: number): void; }

export class ShopHud {
  private readonly world: World; private readonly localShipId: () => number | null;
  private readonly inputController: InputController; private readonly isInRange: () => boolean; private readonly net: ShopNet;
  private readonly backdrop: HTMLDivElement; private readonly creditsEl: HTMLDivElement; private readonly levelEl: HTMLDivElement;
  private readonly upgradeBtn: HTMLButtonElement; private visible = false;
  constructor(world: World, localShipId: () => number | null, inputController: InputController, isInRange: () => boolean, net: ShopNet, _keybindings: Keybindings) {
    this.world = world; this.localShipId = localShipId; this.inputController = inputController; this.isInRange = isInRange; this.net = net;
    this.backdrop = document.createElement('div'); Object.assign(this.backdrop.style,{position:'fixed',inset:'0',zIndex:'20000',display:'none',alignItems:'center',justifyContent:'center',background:'rgba(2,4,10,.76)',backdropFilter:'blur(5px)',font:'14px system-ui,sans-serif',color:'#eaf4ff'});
    const panel=document.createElement('div'); Object.assign(panel.style,{width:'min(520px,92vw)',padding:'24px',borderRadius:'14px',background:'rgba(8,12,22,.98)',border:'1px solid #3a4a6a',boxShadow:'0 20px 70px rgba(0,0,0,.65)'}); this.backdrop.appendChild(panel);
    const title=document.createElement('h2'); title.textContent='ARMORY'; Object.assign(title.style,{margin:'0 0 8px',letterSpacing:'.18em',color:'#8fd0ff'}); panel.appendChild(title);
    this.creditsEl=document.createElement('div'); this.levelEl=document.createElement('div'); Object.assign(this.creditsEl.style,{color:'#e2b04a',marginBottom:'4px',fontWeight:'700'}); Object.assign(this.levelEl.style,{color:'#9fb0c8',marginBottom:'18px'}); panel.append(this.creditsEl,this.levelEl);
    const card=document.createElement('div'); Object.assign(card.style,{padding:'16px',border:'1px solid #3a4a6a',borderRadius:'10px',marginBottom:'12px'});
    const h=document.createElement('div'); h.textContent='LOCK-ON MISSILE'; Object.assign(h.style,{fontWeight:'800',letterSpacing:'.08em'}); card.appendChild(h);
    const d=document.createElement('div'); d.textContent='Secondary weapon · uses the aim-assist target lock'; Object.assign(d.style,{margin:'7px 0 12px',color:'#6b7a94',fontSize:'12px'}); card.appendChild(d);
    this.upgradeBtn=document.createElement('button'); Object.assign(this.upgradeBtn.style,{width:'100%',padding:'12px',border:'0',borderRadius:'8px',background:'#e2b04a',color:'#171006',fontWeight:'800',cursor:'pointer'}); this.upgradeBtn.onclick=()=>this.net.sendBuy(Items.LOCK_MISSILE); card.appendChild(this.upgradeBtn); panel.appendChild(card);
    const equip=document.createElement('button'); equip.textContent='EQUIP · SECONDARY'; Object.assign(equip.style,{width:'100%',padding:'12px',marginBottom:'10px',border:'1px solid #3a4a6a',borderRadius:'8px',background:'#101829',color:'#8fd0ff',cursor:'pointer'}); equip.onclick=()=>this.net.sendEquip(Slots.SECONDARY,Items.LOCK_MISSILE); panel.appendChild(equip);
    const repair=document.createElement('button'); repair.textContent='REPAIR HULL · 50 CR'; Object.assign(repair.style,{width:'100%',padding:'12px',marginBottom:'10px',border:'1px solid #3a4a6a',borderRadius:'8px',background:'#101829',color:'#cfd8e6',cursor:'pointer'}); repair.onclick=()=>this.net.sendRepair(); panel.appendChild(repair);
    const close=document.createElement('button'); close.textContent='CLOSE'; Object.assign(close.style,{width:'100%',padding:'10px',border:'0',background:'transparent',color:'#6b7a94',cursor:'pointer'}); close.onclick=()=>this.close(); panel.appendChild(close);
    this.backdrop.onclick=e=>{if(e.target===this.backdrop)this.close()}; document.body.appendChild(this.backdrop);
    window.addEventListener('keydown',e=>{if(e.code==='KeyF')this.toggle();if(e.code==='Escape')this.close()}); this.render();
  }
  private ship(): Ship|undefined { const id=this.localShipId(); return id==null?undefined:this.world.get(id) as Ship|undefined; }
  private render(): void { const s=this.ship(); if(!s)return; const level=s.lockMissileLevel||1; this.creditsEl.textContent=`CREDITS: ${s.credits}`; this.levelEl.textContent=`LOCK MISSILE LEVEL ${level}/${LOCK_MISSILE_MAX_LEVEL}`; if(level>=LOCK_MISSILE_MAX_LEVEL){this.upgradeBtn.textContent='MAX LEVEL';this.upgradeBtn.disabled=true;}else{const p=lockMissilePrice(level);this.upgradeBtn.textContent=`UPGRADE · ${p} CR`;this.upgradeBtn.disabled=s.credits<p;} }
  update(): void { if(!this.visible)return; const s=this.ship(); if(!s||s.alive===false||!this.isInRange()){this.close();return;} this.render(); }
  isOpen(): boolean{return this.visible;}
  toggle(): void{if(this.visible)this.close();else if(this.isInRange())this.open();}
  private open():void{this.visible=true;this.backdrop.style.display='flex';this.inputController.setEnabled(false);document.body.style.cursor='auto';this.render();}
  private close():void{this.visible=false;this.backdrop.style.display='none';this.inputController.setEnabled(true);document.body.style.cursor='';}
}
