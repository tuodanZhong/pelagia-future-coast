export type PersonKind='adult'|'senior'|'child';
export type PersonModel={id:string;file:string;kind:PersonKind;sex:'male'|'female';height:number;gaitSpeed:number};
export const PERSON_MODELS:PersonModel[]=[
  {id:'player',file:'pelagia-citizen.glb',kind:'adult',sex:'male',height:1.78,gaitSpeed:1.4},
  {id:'woman',file:'pelagia-citizen-female.glb',kind:'adult',sex:'female',height:1.68,gaitSpeed:1.29},
  {id:'senior-male',file:'npc-senior-male.glb',kind:'senior',sex:'male',height:1.76,gaitSpeed:1.40},
  {id:'senior-female',file:'npc-senior-female.glb',kind:'senior',sex:'female',height:1.65,gaitSpeed:1.29},
  {id:'boy',file:'npc-boy.glb',kind:'child',sex:'male',height:1.36,gaitSpeed:1.11},
  {id:'girl',file:'npc-girl.glb',kind:'child',sex:'female',height:1.34,gaitSpeed:1.06},
  {id:'casual-male',file:'npc-casual-male.glb',kind:'adult',sex:'male',height:1.82,gaitSpeed:1.4},
  {id:'casual-female',file:'npc-casual-female.glb',kind:'adult',sex:'female',height:1.72,gaitSpeed:1.29},
];
export type CitizenSpec={model:string;x:number;z:number;pace:number;route:number;yaw?:number;offset?:number;wardrobe?:string};
// Different faces share a neighbourhood; families keep their matching short sidewalk routes.
export const CITIZENS:CitizenSpec[]=[
  {model:'senior-male',x:21,z:113,pace:0,route:0,yaw:-.9},
  {model:'girl',x:20,z:110.5,pace:0,route:0,yaw:-.4},
  {model:'casual-female',x:-21,z:114,pace:.94,route:5,offset:1},
  {model:'boy',x:-23,z:114,pace:.94,route:5,offset:1},
  {model:'casual-male',x:32,z:80,pace:1.30,route:7,offset:2},
  {model:'woman',x:-32,z:92,pace:1.15,route:7,offset:4},
  {model:'senior-female',x:31.8,z:64,pace:.82,route:6,offset:3},
  {model:'casual-male',x:-32,z:43,pace:1.30,route:7,wardrobe:'#a3b8c3'},
  {model:'woman',x:32,z:27,pace:1.2,route:7,wardrobe:'#b4c3b5'},
  {model:'senior-male',x:32,z:-26,pace:.90,route:6,wardrobe:'#b7bcc2'},
  {model:'casual-female',x:-32,z:-27,pace:1.25,route:7,wardrobe:'#aab7cc'},
  {model:'boy',x:130,z:84,pace:.96,route:6,offset:1,wardrobe:'#d7c3a2'},
  {model:'casual-male',x:132,z:84,pace:.96,route:6,offset:1,wardrobe:'#b2bca8'},
  {model:'senior-female',x:-130,z:48,pace:.8,route:6,wardrobe:'#b2b8c4'},
  {model:'woman',x:32,z:-97,pace:1.20,route:7,offset:5},
  {model:'casual-female',x:-33.5,z:-99,pace:1.15,route:7,offset:3},
  // Vendors face their counters; customers leave the promenade open.
  {model:'casual-male',x:26.66,z:100.3,pace:0,route:0,yaw:-Math.PI/2,wardrobe:'#acb6b0'},
  {model:'woman',x:24.32,z:100.55,pace:0,route:0,yaw:Math.PI/2,wardrobe:'#b9b9ba'},
  {model:'casual-female',x:-26.66,z:100.3,pace:0,route:0,yaw:Math.PI/2},
  {model:'senior-female',x:-24.32,z:100.05,pace:0,route:0,yaw:-Math.PI/2,wardrobe:'#c6bda7'},
  {model:'senior-male',x:26.66,z:79.5,pace:0,route:0,yaw:-Math.PI/2,wardrobe:'#babda4'},
  {model:'boy',x:24.32,z:79.75,pace:0,route:0,yaw:Math.PI/2},
  {model:'woman',x:-26.66,z:79.5,pace:0,route:0,yaw:Math.PI/2,wardrobe:'#a0b3ae'},
  {model:'casual-male',x:-24.32,z:79.25,pace:0,route:0,yaw:-Math.PI/2,wardrobe:'#adb8c0'},
];
