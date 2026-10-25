const headers=['Event ID','Timestamp','Source','Computer','Channel','EventRecordID','TargetUserName','TargetDomainName','IpAddress','LogonType','Message'];
function row(record,id='4625',overrides={}) {
  return {'Event ID':id,Timestamp:'2026-10-25T09:0'+(record-101)+':00Z',Source:'Microsoft-Windows-Security-Auditing',Computer:'DC-LAB',Channel:'Security',
    EventRecordID:String(record),TargetUserName:'learner',TargetDomainName:'LAB',IpAddress:'198.51.100.42',LogonType:'3',Message:'Fictional event',...overrides};
}
const csv=records=>[headers,...records.map(record=>headers.map(header=>record[header]??''))].map(values=>values.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n');
function files() {
  return [{name:'first.csv',text:csv([row(101),row(102),row(103)])},{name:'second.csv',text:csv([row(103),row(104),row(105),row(106,'4624')])}];
}
module.exports={headers,row,csv,files};
