import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { SellerInventoryPage } from '../src/pages/SellerInventoryPage';
import '../src/styles/index.css';
let applied=false;
const rows=[{index:0,line:5,state:'valid',action:'new',values:{name:'Hosszú kártyanév és kiadás (2026)',quantity:3,price:1500,graphic_type:'normal'},issues:[]},{index:1,line:6,state:'needs_card',values:{name:'Kiválasztandó lapkiadás',quantity:1,price:500,graphic_type:'normal'},issues:['Kérjük, válassz a lapkiadások közül.']}];
window.fetch=async(url,options)=>{
  const path=String(url); let body:any=[];
  if(path.includes('/sources')) body=[];
  else if(path.includes('/operations/8')) { if(path.includes('/apply')) applied=true; body={id:8,kind:'import',status:applied?'partial':'preview',source_id:1,total:2,lookup_remaining:0,visible_total:applied?1:2,version:'a'.repeat(64),counts:applied?{applied:1,needs_card:1}:{new:1,needs_card:1},context:{},rows:applied?rows.slice(1):rows,changes_count:applied?1:0}; }
  else if(path.includes('/operations')) body=[{id:8,kind:'import',status:'partial',created_at:'2026-11-21T08:00:00Z'}];
  else if(path.includes('/inventory?')) body={total:0,items:[]};
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
ReactDOM.createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/inventory']}><SellerInventoryPage/></MemoryRouter>);
