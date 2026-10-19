"""NIU standalone throttle dashboard. Run with Python + Tkinter; no pip packages."""
import argparse
import queue
import time
import tkinter as tk
from tkinter import ttk, messagebox
from transport import Link


class Dashboard:
    def __init__(self, root, demo=False):
        self.root=root;self.link=Link();self.last_status=0;self.connected=False
        self.demo=demo;self.stopping=False;self.previous_fault='none'
        root.title('NIU Motor Control | v4.3');root.geometry('970x760');root.minsize(900,740)
        root.configure(bg='#eef2f6')
        style=ttk.Style();style.theme_use('clam')
        style.configure('TButton',font=('Segoe UI',11),padding=(16,10))
        style.configure('Stop.TButton',background='#b42332',foreground='white',font=('Segoe UI',12,'bold'))
        style.map('Stop.TButton',background=[('active','#8b1a26')])
        header=tk.Frame(root,bg='#12283f',padx=24,pady=12);header.pack(fill='x')
        tk.Label(header,text='NIU  /  MOTOR CONTROL',fg='white',bg='#12283f',font=('Segoe UI',20,'bold')).pack(anchor='w')
        tk.Label(header,text='Current throttle  |  36 V bench  |  0-2 A request',fg='#c6d4e3',bg='#12283f',font=('Segoe UI',11)).pack(anchor='w',pady=(4,0))
        body=tk.Frame(root,bg='#eef2f6',padx=24,pady=12);body.pack(fill='both',expand=True)
        top=tk.Frame(body,bg='#eef2f6');top.pack(fill='x')
        self.connection=tk.StringVar(value='Disconnected - motor state unknown')
        tk.Label(top,textvariable=self.connection,bg='#eef2f6',fg='#334155',font=('Segoe UI',11),wraplength=680,justify='left').pack(side='left')
        self.connect_button=ttk.Button(top,text='Connect ST-Link',command=self.connect);self.connect_button.pack(side='right')
        self.state=tk.StringVar(value='NO LIVE DATA')
        tk.Label(body,textvariable=self.state,bg='#eef2f6',fg='#12283f',font=('Segoe UI',22,'bold')).pack(anchor='w',pady=(12,4))
        self.detail=tk.StringVar(value='Connect to read the board. Connecting does not start, stop or reset it.')
        tk.Label(body,textvariable=self.detail,bg='#eef2f6',fg='#475569',font=('Segoe UI',11),wraplength=890,justify='left').pack(anchor='w')
        grid=tk.Frame(body,bg='#eef2f6');grid.pack(fill='x',pady=12)
        self.values={}
        cards=[('speed','SPEED','mph'),('target','CURRENT REQUEST','A'),('throttle','THROTTLE INPUT','V'),
               ('vm','VM BUS','V'),('current','PHASE CURRENT SAMPLE','A'),('pcb','PCB TEMPERATURE','C')]
        for i,(key,label,unit) in enumerate(cards):
            col=i%3;row=i//3;grid.columnconfigure(col,weight=1)
            card=tk.Frame(grid,bg='white',padx=16,pady=10,highlightbackground='#dce3eb',highlightthickness=1)
            card.grid(row=row,column=col,sticky='nsew',padx=(0,10 if col<2 else 0),pady=(0,10))
            tk.Label(card,text=label,bg='white',fg='#64748b',font=('Segoe UI',9,'bold')).pack(anchor='w')
            var=tk.StringVar(value='-- '+unit);self.values[key]=(var,unit)
            tk.Label(card,textvariable=var,bg='white',fg='#12283f',font=('Segoe UI',24,'bold')).pack(anchor='w')
        self.extra=tk.StringVar(value='Duty: --    Reference: --    Demo battery: --    Hall: --')
        tk.Label(body,textvariable=self.extra,bg='#eef2f6',fg='#475569',font=('Segoe UI',10)).pack(anchor='w')
        actions=tk.Frame(body,bg='#eef2f6');actions.pack(fill='x',pady=(12,12))
        self.enable=ttk.Button(actions,text='Enable throttle',command=lambda:self.send('start'));self.enable.pack(side='left')
        self.stop=ttk.Button(actions,text='STOP MOTOR',style='Stop.TButton',command=lambda:self.send('stop'));self.stop.pack(side='left',padx=10)
        self.clear=ttk.Button(actions,text='Clear fault',command=lambda:self.send('reset'));self.clear.pack(side='left')
        self.fault=tk.StringVar(value='Fault: no live reading')
        tk.Label(body,textvariable=self.fault,bg='#fff0ed',fg='#9e2929',font=('Segoe UI',11,'bold'),padx=12,pady=10,anchor='w',wraplength=860).pack(fill='x')
        tk.Label(body,text='0.50 V = idle  |  Launch assist up to 1 A  |  2.50 V = 2 A  |  Return to idle before Enable.\nStop removes drive; the wheel coasts. Disconnecting the GUI does NOT stop the motor.',
                 bg='#eef2f6',fg='#475569',font=('Segoe UI',10),justify='left').pack(anchor='w',pady=(12,10))
        self.log=tk.Text(body,height=5,bg='#12283f',fg='#e1eaf3',font=('Consolas',9),relief='flat',padx=10,pady=8,state='disabled')
        self.log.pack(fill='both',expand=True)
        root.protocol('WM_DELETE_WINDOW',self.close)
        self.controls(False)
        if demo: root.after(100,self.demo_status)
        root.after(100,self.poll)

    def controls(self,live):
        for button in (self.enable,self.stop,self.clear):button.configure(state='normal' if live and not self.demo else 'disabled')

    def record(self,text):
        self.log.configure(state='normal');self.log.insert('end',time.strftime('%H:%M:%S')+'  '+text+'\n')
        if int(self.log.index('end-1c').split('.')[0])>200:self.log.delete('1.0','20.0')
        self.log.see('end');self.log.configure(state='disabled')

    def connect(self):
        if self.demo:return
        if self.link.thread and self.link.thread.is_alive():
            self.link.disconnect();return
        self.last_status=0;self.controls(False);self.connection.set('Connecting...')
        self.connect_button.configure(state='disabled')
        self.link.connect()

    def send(self,command):
        if not self.connected or time.monotonic()-self.last_status>2:
            self.record('No fresh connection. Use the physical VM shutoff if needed.');return
        if self.link.send(command):
            if command=='stop':self.stopping=True;self.detail.set('STOP requested - waiting for board confirmation.')
            self.record(command.upper()+' requested')

    def update(self,data):
        self.last_status=time.monotonic();self.connected=True
        self.connection.set('DEMO PREVIEW - no hardware connection' if self.demo else 'ST-Link connected | live v'+data['revision'])
        self.connect_button.configure(text='Disconnect',state='disabled' if self.demo else 'normal')
        self.controls(True);self.state.set(data['state'].replace('_',' '))
        details={
            'WAIT_TORQUE':'Low request could not sustain motion. Increase throttle or return to idle before retrying.',
            'WAIT_VM':'Waiting for 34-38 V to arm. Keep throttle at idle.',
            'WAIT_IDLE':'Hold throttle at 0.35-0.60 V for 0.5 seconds.',
            'WAIT_STILL':'Waiting for wheel to stop before current-zero calibration.',
            'WAIT_SENSORS':'Waiting for valid Hall, PCB temperature and charge-release checks.',
            'READY':'Ready. Raise the external throttle to run; returning to idle will keep it ready.',
            'DRIVING':'Throttle control active. No PC heartbeat or session time limit.',
            'COASTING':'Drive reduced/off while the wheel slows. Throttle control remains enabled.',
            'STOPPED':'Drive inhibited. Return to idle, then press Enable throttle.',
            'CHARGE':'Charge input is active. Motor disabled; idle required after charge mode.',
            'FAULT':'Drive disabled. Correct the cause, return to idle, then Clear fault and Enable.'}
        self.detail.set(details[data['state']])
        fault_text='Fault: '+data['fault']
        if data['fault']!='none' and data.get('fault_vm',-1)>=0:
            fault_text+=f" | At trip: {data['fault_vm']:.2f} V, {data['fault_current']:.2f} A, {data['fault_duty']:.1f}% duty"
        self.fault.set(fault_text)
        if data['fault']!=self.previous_fault:
            self.record(fault_text);self.previous_fault=data['fault']
        for key,(var,unit) in self.values.items():
            val=data[key];var.set('-- '+unit if key=='pcb' and val==-999 else f'{val:.2f} {unit}')
        soc=f"{data['soc']:.1f}%" if data['soc']>=0 else 'unavailable'
        self.extra.set(f"Duty: {data['duty']:.1f}%    Reference: {data['reference']:.2f} A    Demo battery: {soc}    Hall: {data['hall']:03b}")
        if self.stopping and data['state']=='STOPPED' and data['duty']==0 and not data['armed']:
            self.stopping=False;self.record('STOP confirmed by board. Wheel may still coast.')

    def poll(self):
        try:
            while True:
                kind,value=self.link.events.get_nowait()
                if kind=='status':self.update(value)
                else:
                    self.record(value)
                    if kind in {'error','stale','disconnected'}:
                        self.connected=False;self.controls(False);self.connection.set(value)
                        self.state.set('NO LIVE DATA');self.detail.set('Motor state unknown. GUI disconnect does not stop standalone operation.')
                    if kind=='disconnected':self.connect_button.configure(text='Connect ST-Link',state='normal')
        except queue.Empty:pass
        if self.connected and not self.demo and time.monotonic()-self.last_status>2:
            self.connected=False;self.controls(False);self.state.set('STALE DATA')
            self.connection.set('No fresh readings - motor may still be running')
        self.root.after(100,self.poll)

    def close(self):
        if not self.demo and not messagebox.askokcancel('Close dashboard','Closing does NOT stop the motor.\nUse STOP MOTOR first if you want to stop.\n\nClose the dashboard?'):
            return
        self.link.disconnect()
        self.connect_button.configure(state='disabled');self.controls(False)
        self.root.after(100,self.finish_close)

    def finish_close(self):
        if self.link.thread and self.link.thread.is_alive():
            self.root.after(100,self.finish_close)
        else:self.root.destroy()

    def demo_status(self):
        self.update(dict(revision='4.3',state='READY',fault='none',throttle=.5,target=0,
            speed=0,vm=36,current=0,pcb=27.2,duty=0,soc=50,hall=6,reference=0,armed=1))
        self.record('Preview only. No ST-Link, motor or firmware commands.')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--demo',action='store_true')
    parser.add_argument('--screenshot',help='Save a demo preview PNG and exit (Pillow required)')
    args=parser.parse_args()
    if args.screenshot and not args.demo:parser.error('--screenshot requires --demo')
    # Keep Tk coordinates and screenshot pixels consistent on scaled Windows displays.
    import ctypes
    try:ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError,OSError):pass
    root=tk.Tk();root.tk.call('tk','scaling',1.33);app=Dashboard(root,args.demo)
    if args.screenshot:
        def capture():
            from PIL import ImageGrab
            root.update()
            ImageGrab.grab(bbox=(root.winfo_rootx(),root.winfo_rooty(),root.winfo_rootx()+root.winfo_width(),root.winfo_rooty()+root.winfo_height())).save(args.screenshot)
            root.destroy()
        root.after(1200,capture)
    root.mainloop()
