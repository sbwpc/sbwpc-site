"""Clean the SBWPC sign-up sheet export and build one import statement.
Output: import.sql (contains member data: never commit this file) and review.txt."""
import csv, io, re, json, datetime as dt, sys
SRC='/mnt/user-data/attachments/4d4f96d7-1027-5b0f-b4df-9d999dd7d799/c5b24280-SBWPC_Membership_Form_Sign_Up_Sheet'
raw=open(SRC,encoding='utf-8').read()
parts=re.split(r'^## Sheet name: (.*)$',raw,flags=re.M)
sheets={parts[i].strip():list(csv.reader(io.StringIO(parts[i+1].strip('\n')))) for i in range(1,len(parts),2)}
mem=sheets['Membership New | Renewal']; don=sheets['Donations | JF']
LEVELS={'Friend':16,'Advocate':40,'Feminist Household':60,'Access':125,'Voice':300,'Power':500,'Feminist Champion':1000,'Legacy':5000}
flags=[]
def pdate(s):
    s=s.strip()
    m=re.fullmatch(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})',s)
    return dt.date(int(m[3]),int(m[1]),int(m[2])) if m else None
def case(s):
    s=re.sub(r'\s+',' ',s.strip())
    if len(s)>2 and (s.islower() or s.isupper()): return s.title()
    return s
def clean(s): return re.sub(r'\s+',' ',s.strip()) or None
def state(s):
    s=s.strip()
    return {'california':'CA','ca':'CA'}.get(s.lower(),s) or None

# ---- membership rows
rows=[]
for r in mem[1:]:
    r=r+['']*(18-len(r))
    d=dict(date=r[0],first=r[1],last=r[2],email=r[3],a1=r[4],a2=r[5],city=r[6],state=r[7],zip=r[8],phone=r[9],occ=r[10],comm=r[11],auth=r[12],ref=r[13],buy=r[14],payer=r[15],sid=r[17])
    rows.append(d)
# submission IDs rise with time: fit a line on rows whose dates look right, to estimate missing or mistyped dates
pts=[(int(d['sid']),pdate(d['date']).toordinal()) for d in rows if d['sid'] and pdate(d['date']) and 2026==pdate(d['date']).year]
def fit(pts):
    n=len(pts);mx=sum(x for x,_ in pts)/n;my=sum(y for _,y in pts)/n
    b=sum((x-mx)*(y-my) for x,y in pts)/sum((x-mx)**2 for x,_ in pts);return b,my-b*mx
b,a=fit(pts)
# drop outliers (dates that disagree with their submission order by more than 5 days), then refit
good=[(x,y) for x,y in pts if abs(a+b*x-y)<=5]; b,a=fit(good)
def est(sid): return dt.date.fromordinal(round(a+b*int(sid)))

out=[]
for d in rows:
    who=f"{d['first'].strip()} {d['last'].strip()}"
    notes=[]
    first,last=case(d['first']),case(d['last'])
    if last=='PIzarro': last='Pizarro'
    household=None
    if '&' in first:
        a_,b_=[case(x) for x in first.split('&')]; first=a_; household=f"{b_} {last}"; notes.append(f"Household membership: {a_} and {b_} {last}.")
    payer_first=(re.search(r'First Name: *(.*)',d['payer']) or [None,''])[1].strip()
    payer_last=(re.search(r'Last Name: *(.*)',d['payer']) or [None,''])[1].strip()
    if len(first)==1 and payer_first:
        flags.append(f"{who}: first name was '{first}' in the sheet; used the PayPal payer name '{payer_first}'."); first=payer_first
    elif payer_last and payer_last.lower().replace(' ','') not in (last.lower().replace(' ','') , (first+last).lower().replace(' ','')) and last.lower() not in payer_last.lower():
        notes.append(f"PayPal payer name: {payer_first} {payer_last}.")
    txn=(re.search(r'Transaction ID: *(\S+)',d['payer']) or [None,None])[1]
    a1,a2,city,st,zp=clean(d['a1']),clean(d['a2']),clean(d['city']),state(d['state']),clean(d['zip'])
    if st and len(st)>2 and zp and len(zp)==2:  # city and state shifted one column right
        flags.append(f"{who}: address columns were shifted (city '{city}', state '{st}', zip '{zp}'); fixed to city {st}, state {zp}, zip left blank."); city,st,zp=st,zp.upper(),None; a2=None if (a2 or '').upper()=='N/A' else a2
    if a1 and a1.isdigit() and a2:
        flags.append(f"{who}: street number and street were split across two fields; joined as '{a1} {a2}'."); a1,a2=f"{a1} {a2}",None
    if a2 and a2.lower()==f"{first} {last}".lower(): a2=None
    if zp and re.fullmatch(r'\d{4}',zp):
        flags.append(f"{who}: zip '{zp}' lost its leading zero; stored as 0{zp}."); zp='0'+zp
    city=case(city) if city else None
    date=pdate(d['date']); sid=d['sid']
    if sid:
        e=est(sid)
        if date is None:
            flags.append(f"{who}: no date in the sheet; estimated {e:%b %d, %Y} from its place in the submission order."); notes.append('Join date estimated from submission order.'); date=e
        elif abs((date-e).days)>5:
            flags.append(f"{who}: date '{d['date']}' does not fit the submission order; used {e:%b %d, %Y}."); notes.append(f"Sheet date was {d['date']}; corrected from submission order."); date=e
    m=re.match(r'\s*([A-Za-z ]+?)\s*(?:\(Amount: *([\d.]+)|: *([\d.]+))',d['buy'])
    level=amt=None
    if m:
        level=m[1].strip(); amt=round(float(m[2] or m[3])*100)
        assert level in LEVELS and LEVELS[level]*100==amt,(who,level,amt)
    else:
        flags.append(f"{who}: the sheet has no membership level or payment for this row; imported the person only, with no membership."); notes.append('Membership form submitted with no level or payment recorded in the sheet. Confirm with the treasurer.')
    if not level: notes=[n for n in notes if not n.startswith('Join date estimated')]
    method='paypal' if txn else 'other'
    if level and not txn:
        flags.append(f"{who}: no PayPal transaction ID (entered by hand in the sheet); payment recorded as method 'other'.")
    if not d['email'].strip(): flags.append(f"{who}: no email, address or phone in the sheet.")
    ref=clean(d['ref'])
    if ref and len(ref)>40: notes.append('Member note: '+ref); ref=None
    comm=[c.strip() for c in d['comm'].split('\n') if c.strip() and not c.strip().lower().startswith('no,')]
    out.append(dict(t='m',f=first,l=last,e=clean(d['email']),ph=clean(d['phone']),a1=a1,a2=a2,c=city,s=st,z=zp,o=clean(d['occ']),opt=d['auth'].strip().lower().startswith('yes'),n=' '.join(notes) or None,
        lv=level,amt=amt,d=date.isoformat() if date else None,x=(date.replace(year=date.year+1)).isoformat() if date and level else None,h=household,cm=comm,rf=ref,tx=txn,pm=method))

# ---- donations
# calibration for IDs older than the membership rows uses the same line
for r in don[1:]:
    r=r+['']*(19-len(r))
    who=f"{r[3].strip()} {r[4].strip()}"; notes=[]
    amt=round(float(re.search(r'Amount: *([\d.]+)',r[0])[1])*100)
    txn=(re.search(r'Transaction ID: *(\S+)',r[1]) or [None,None])[1]
    payer_first=(re.search(r'First Name: *(.*)',r[1]) or [None,''])[1].strip()
    payer_last=(re.search(r'Last Name: *(.*)',r[1]) or [None,''])[1].strip()
    if payer_first and payer_first.lower() not in r[3].lower(): notes.append(f"PayPal payer name: {payer_first} {payer_last}.")
    date=pdate(r[17])
    if date is None:
        date=est(r[18]); flags.append(f"{who} (donation ${amt/100:.0f}): no date in the sheet; estimated {date:%b %d, %Y} from its place in the submission order."); notes.append('Donation date estimated from submission order.')
    out.append(dict(t='d',f=case(r[3]),l=case(r[4]),e=clean(r[5]),ph=clean(r[11]),a1=clean(r[6]),a2=clean(r[7]),c=case(r[8]) if r[8].strip() else None,s=state(r[9]),z=clean(r[10]),o=clean(r[12]),opt=r[14].strip().lower().startswith('yes'),n=' '.join(notes) or None,
        amt=amt,d=date.isoformat(),hon=clean(r[16]),tx=txn,pm='paypal' if txn else 'other'))

payload=json.dumps(out,ensure_ascii=False,separators=(',',':'))
for bad in ('\\','`','${','$j$','$imp$'): assert bad not in payload,bad
sql='''do $imp$
declare r jsonb; pid uuid; mid uuid;
begin
  if exists (select 1 from public.people where source = 'import') then raise exception 'The sheet has already been imported'; end if;
  for r in select * from jsonb_array_elements($j$'''+payload+'''$j$::jsonb) loop
    pid := null; mid := null;
    if r->>'e' is not null then select id into pid from public.people where lower(email::text) = lower(r->>'e') limit 1; end if;
    if pid is null then
      insert into public.people (first_name, last_name, email, phone, address1, address2, city, state, zip, occupation, email_opt_in, notes, source)
      values (r->>'f', r->>'l', r->>'e', r->>'ph', r->>'a1', r->>'a2', r->>'c', r->>'s', r->>'z', r->>'o', (r->>'opt')::boolean, r->>'n', 'import') returning id into pid;
    elsif r->>'n' is not null then
      update public.people set notes = concat_ws(' ', notes, r->>'n') where id = pid;
    end if;
    if r->>'t' = 'm' and r->>'lv' is not null then
      insert into public.memberships (person_id, level, state, starts_on, expires_on, household_name, committees, referred_by, source)
      values (pid, r->>'lv', 'active', (r->>'d')::date, (r->>'x')::date, r->>'h', array(select jsonb_array_elements_text(r->'cm')), r->>'rf', 'import') returning id into mid;
    end if;
    if r->>'amt' is not null then
      insert into public.payments (person_id, membership_id, kind, amount_cents, paid_on, method, status, paypal_capture_id, in_honor_of, source, created_by)
      values (pid, mid, case when r->>'t' = 'm' then 'dues' else 'donation' end, (r->>'amt')::int, (r->>'d')::date, r->>'pm', 'completed', r->>'tx', r->>'hon', 'import', 'sheet import');
    end if;
  end loop;
end $imp$;'''
open('import.sql','w',encoding='utf-8').write(sql)
ms=[o for o in out if o['t']=='m']
print('membership rows',len(ms),'| with membership',sum(1 for o in ms if o['lv']),'| donations',sum(1 for o in out if o['t']=='d'))
print('dues total $',sum(o['amt'] for o in ms if o['amt'])/100,'| donations total $',sum(o['amt'] for o in out if o['t']=='d')/100)
from collections import Counter
print('levels',dict(Counter(o['lv'] for o in ms)))
print('sql chars',len(sql),'non-ascii',sum(1 for ch in sql if ord(ch)>127),'checksum',sum(map(ord,sql))%1000003)
open('review.txt','w').write('\n'.join(flags))
print(len(flags),'flags')
