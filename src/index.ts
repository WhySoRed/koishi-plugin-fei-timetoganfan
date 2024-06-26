import { Context, Schema, h } from "koishi";
export const inject = {
  required: ["database"],
  optional: ["cron"],
};

import {} from "koishi-plugin-cron";
import {} from "@koishijs/plugin-help";

export const name = "fei-timetoganfan";

export interface Config {
  atTheUser: boolean;
  breakfastText: string;
  lunchText: string;
  dinnerText: string;
  snacksText: string;
  drinkText: string;
  midnightText: string;
  botMenuText: string;
  enabledReminderToEat: boolean;
  breakfastTime?: string;
  lunchTime?: string;
  dinnerTime?: string;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    atTheUser: Schema.boolean().default(false).description("是否@用户"),
    breakfastText: Schema.string()
      .default("你的早饭就吃[food]吧")
      .description("早饭抽取文本"),
    lunchText: Schema.string()
      .default("你的午饭就吃[food]吧")
      .description("午饭抽取文本"),
    dinnerText: Schema.string()
      .default("你的晚饭就吃[food]吧")
      .description("晚饭抽取文本"),
    snacksText: Schema.string()
      .default("你的零食就吃[food]吧")
      .description("零食抽取文本"),
    drinkText: Schema.string()
      .default("你的饮料就喝[food]吧")
      .description("饮料抽取文本"),
    midnightText: Schema.string()
      .default("你的夜宵就吃[food]吧")
      .description("夜宵抽取文本"),
    botMenuText: Schema.string()
      .default("我没有菜单...")
      .description("机器人被查看菜单艾特时的回复"),
  }),
  Schema.object({
    enabledReminderToEat: Schema.boolean()
      .default(false)
      .description("是否启用餐点提醒(依赖cron服务)"),
  }).description("餐点提醒"),
  Schema.union([
    Schema.object({
      enabledReminderToEat: Schema.const(false).required(),
    }),
    Schema.object({
      breakfastTime: Schema.string()
        .default("07:00")
        .description("早餐时间，格式为24小时制 hh:mm，下同"),
      lunchTime: Schema.string().default("12:00").description("午餐时间"),
      dinnerTime: Schema.string().default("18:00").description("晚餐时间"),
    }),
  ]),
]);

declare module "koishi" {
  interface Tables {
    userFoodMenu: UserFoodMenu;
  }
}

type foodType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snacks"
  | "drink"
  | "middlenight";

export interface UserFoodMenu {
  uid: string;
  foodName: string;
  foodType: foodType;
  weigth: number;
}

export const usage = `
现在是...
吃饭时间！
`;
export function apply(ctx: Context, config: Config) {
  const foodTypes: foodType[] = [
    "breakfast",
    "lunch",
    "dinner",
    "snacks",
    "drink",
    "middlenight",
  ];

  ctx.model.extend(
    "userFoodMenu",
    {
      uid: { type: "string", nullable: false },
      foodName: { type: "string", nullable: false },
      foodType: { type: "string", nullable: false },
      weigth: { type: "double", nullable: false },
    },
    {
      primary: ["uid", "foodName", "foodType"],
    }
  );

  //当应用启动时设定定时提醒
  ctx.on("ready", () => {
    if (ctx.cron && config.enabledReminderToEat) {
      const timeFormat = /([01]\d|2[0-3]):([0-5]\d)/;
      if (!timeFormat.test(config.breakfastTime)) {
        throw new Error("早餐时间格式错误！");
      }
      if (!timeFormat.test(config.lunchTime)) {
        throw new Error("午餐时间格式错误！");
      }
      if (!timeFormat.test(config.dinnerTime)) {
        throw new Error("晚餐时间格式错误！");
      }
      const breakfastTimeCron =
        "0 " +
        config.breakfastTime.split(":").map(Number).reverse().join(" ") +
        " * * *";
      const lunchTimeCron =
        "0 " +
        config.lunchTime.split(":").map(Number).reverse().join(" ") +
        " * * *";
      const dinnerTimeCron =
        "0 " +
        config.dinnerTime.split(":").map(Number).reverse().join(" ") +
        " * * *";
      ctx.cron(breakfastTimeCron, async () => {
        ctx.bots.forEach(async (bot) => {
          bot.broadcast(
            (await bot.getGuildList()).data.map((guild) => guild.id),
            "早上好！该吃早饭啦！"
          );
        });
      });

      ctx.cron(lunchTimeCron, async () => {
        ctx.bots.forEach(async (bot) => {
          bot.broadcast(
            (await bot.getGuildList()).data.map((guild) => guild.id),
            "中午好！该吃午饭啦！"
          );
        });
      });

      ctx.cron(dinnerTimeCron, async () => {
        ctx.bots.forEach(async (bot) => {
          bot.broadcast(
            (await bot.getGuildList()).data.map((guild) => guild.id),
            "晚上好！该吃晚饭啦！"
          );
        });
      });
    }
  });

  class FoodMenu {
    data: Array<UserFoodMenu> = [];
    //添加菜单， 返回值是在原本在菜单上但权重增加的{食物:增加权重}的键值对
    add(userFoodMenu: UserFoodMenu | Array<UserFoodMenu>) {
      const foodAddWeightList: { [foodName: string]: number } = {};
      if (Array.isArray(userFoodMenu)) {
        userFoodMenu.forEach((item) => {
          const index = this.data.findIndex(
            (i) =>
              i.uid === item.uid &&
              i.foodName === item.foodName &&
              i.foodType === item.foodType
          );
          if (~index) {
            this.data[index].weigth += item.weigth;
            if (foodAddWeightList[item.foodName] === undefined)
              foodAddWeightList[item.foodName] = item.weigth;
            else foodAddWeightList[item.foodName] += item.weigth;
          } else {
            this.data.push(item);
          }
        });
      } else {
        this.data.push(userFoodMenu);
      }
      return foodAddWeightList;
    }

    //将输入的参数数组转换为一个UserFoodMenu数组
    parse(uid: string, foodType: foodType, ...args: string[]) {
      const foodMenuArr: Array<UserFoodMenu> = [];
      if (
        args.find((userInput) => {
          const foodNameWithWigth = userInput
            .replace("（", "(")
            .replace("）", ")"); //把中文括号转换为英文
          return (
            !(
              /(.+)\((\d+)\)$/.test(foodNameWithWigth) ||
              /(.+)\((\d+\.\d+)\)$/.test(foodNameWithWigth) ||
              /(.+)\((\.\d+)\)$/.test(foodNameWithWigth) ||
              /[^()]/.test(foodNameWithWigth)
            ) || /^\(\d+\)$/.test(foodNameWithWigth)
          );
        })
      )
        throw new Error(
          "参数格式错误！应为 食物名1(权重) 食物名2(权重) ...\n权重需要放在括号内并紧挨着食物名称，可以不写但不能小于0"
        );
      else {
        args.forEach((userInput) => {
          const foodNameWithWigth = userInput
            .replace("（", "(")
            .replace("）", ")");
          const foodName = foodNameWithWigth.replace(/(.+)\(.+\)$/, "$1");
          const weigth = Number(
            foodNameWithWigth
              .replace(/.+(\(.+\))$/, "$1")
              .replace("(", "")
              .replace(")", "")
          );
          foodMenuArr.push(new UserFoodMenu(uid, foodName, foodType, weigth));
        });
      }
      return foodMenuArr;
    }

    parseAndAdd(uid: string, foodType: foodType, ...args: string[]) {
      return this.add(this.parse(uid, foodType, ...args));
    }

    transUid(targetUid: string) {
      this.data.forEach((item) => {
        item.uid = targetUid;
      });
    }

    transFoodType(targetFoodType: foodType) {
      this.data.forEach((item) => {
        item.foodType = targetFoodType;
      });
    }

    //根据权重从菜单中抽取一个
    draw() {
      const totalWeigth = this.data.reduce((prev, cur) => prev + cur.weigth, 0);
      const random = Math.random() * totalWeigth;
      let currentWeigth = 0;
      for (let i = 0; i < this.data.length; i++) {
        currentWeigth += this.data[i].weigth;
        if (random < currentWeigth) {
          return this.data[i].foodName;
        }
      }
      return null;
    }

    //该菜单食物权重相同则不显示权重
    async showSingleMenu(uid: string, foodType: foodType) {
      //select的grouBy方法在单参数时会返回一个元素为 {key:value} 的不重复数组
      const weigthGroup = await ctx.database
        .select("userFoodMenu")
        .where({ uid, foodType })
        .groupBy("weigth")
        .execute();
      const sameWeigth = weigthGroup.length === 1;
      const menu = await ctx.database.get("userFoodMenu", { uid, foodType });
      if (menu.length === 0) return "";
      else if (sameWeigth)
        return (
          "<message forward>当前" +
          foodTypeText[foodType].name +
          "菜单：" +
          menu.map((item) => item.foodName).join("，") +
          "</message>"
        );
      else
        return (
          "<message forward>当前" +
          foodTypeText[foodType].name +
          "菜单： " +
          menu
            .map((item) => item.foodName + "(" + item.weigth + ")")
            .join("，") +
          "</message>"
        );
    }

    async showMenu(uid: string) {
      const foodTypeArr = (
        await ctx.database
          .select("userFoodMenu")
          .where({ uid })
          .groupBy("foodType")
          .execute()
      ).map((item) => item.foodType);
      let menuMessage = "<message/><message forward>";
      for (const foodType of foodTypeArr) {
        menuMessage += await this.showSingleMenu(uid, foodType);
      }
      return menuMessage + "</message>";
    }

    //实际上因为构造时传入的参数是ctx.database的返回值，是一个视为数组使用的FlatPick<UserFoodMenu>
    //因此传入类型应该不会是单个食物的UserFoodMenu...
    constructor(userFoodMenu?: UserFoodMenu | Array<UserFoodMenu>) {
      if (Array.isArray(userFoodMenu)) {
        this.data = userFoodMenu;
      } else {
        this.data.push(userFoodMenu);
      }
    }
  }

  class UserFoodMenu {
    uid: string;
    foodName: string;
    foodType: foodType;
    weigth: number = 1; //权重(必须大于0)

    constructor(
      uid: string,
      foodName: string,
      foodType: foodType,
      weigth?: number
    ) {
      this.uid = uid;
      this.foodName = foodName;
      this.foodType = foodType;
      if (weigth) {
        if (weigth < 0) {
          throw new Error("权重不能小于0...");
        }
        this.weigth = weigth;
      }
    }
  }

  const foodTypeText: {
    [key in foodType]: { name: string; returnText: string };
  } = {
    breakfast: { name: "早饭", returnText: config.breakfastText },
    lunch: { name: "午饭", returnText: config.lunchText },
    dinner: { name: "晚饭", returnText: config.dinnerText },
    snacks: { name: "零食", returnText: config.snacksText },
    drink: { name: "饮料", returnText: config.drinkText },
    middlenight: { name: "夜宵", returnText: config.midnightText },
  };

  ctx
    .command("吃什么", "从自己的菜单选择该吃什么~")
    .alias("吃啥")
    .action(async ({ session }, message) => {
      const at =
        config.atTheUser && !session.event.channel.type
          ? h.at(session.userId) + " "
          : "";
      if (foodTypes.includes(message as foodType)) {
        const uid = session.uid;
        const foodType: foodType = message as foodType;
        const foodMenu = new FoodMenu(
          await ctx.database.get("userFoodMenu", { uid, foodType })
        );
        if (foodMenu.data.length === 0)
          if (
            foodType === "lunch" &&
            (
              await ctx.database.get("userFoodMenu", {
                uid,
                foodType: "dinner",
              })
            ).length !== 0
          )
            return (
              at +
              "你的午饭菜单是空的...\n但是你有晚饭菜单\n用指令\n吃什么.复制.午饭 晚饭\n来复制晚饭菜单到午饭菜单"
            );
          else if (
            foodType === "dinner" &&
            (await ctx.database.get("userFoodMenu", { uid, foodType: "lunch" }))
              .length !== 0
          )
            return (
              at +
              "你的晚饭菜单是空的...\n但是你有午饭菜单\n用指令\n吃什么.复制.晚饭 午饭\n来复制午饭菜单到晚饭菜单"
            );
          else if (
            foodType === "middlenight" &&
            (
              await ctx.database.get("userFoodMenu", {
                uid,
                foodType: "dinner",
              })
            ).length !== 0
          )
            return (
              at +
              "你的夜宵菜单是空的...\n但是你有晚饭菜单\n用指令\n吃什么.复制.夜宵 晚饭\n来复制晚饭菜单到夜宵菜单"
            );
          else
            return (
              at +
              `你的${foodTypeText[foodType].name}菜单是空的...\n用指令\n吃什么.添加.${foodTypeText[foodType].name} 食物名1 食物名2 ...\n来添加菜单\n或者你也可以用指令\n吃什么.复制\n来复制菜单...`
            );
        const foodName = foodMenu.draw();
        if (!foodName) return at + "抽取菜单失败！";
        else
          return (
            at + foodTypeText[foodType].returnText.replace("[food]", foodName)
          );
      } else {
        const hour = new Date().getHours();
        if (4 <= hour && hour < 11) session.execute("吃什么 breakfast");
        else if (11 <= hour && hour < 16) session.execute("吃什么 lunch");
        else if (16 <= hour && hour < 23) session.execute("吃什么 dinner");
        else session.execute("吃什么 midnight");
      }
    }).usage(`============
帮我选择吃什么！
发送
吃什么 早饭/午饭/晚饭/零食/饮料/夜宵
来抽取菜单！
===========`);

  //用于注册子指令以及起别名
  ctx
    .command("吃什么.早饭", { hidden: true })
    .alias(".早餐", "早饭吃什么", "早饭吃啥")
    .action(async ({ args, session }) => {
      if (args[0] === "添加")
        session.execute("吃什么.添加 早饭 " + args.slice(1).join(" "));
      if (args[0] === "复制")
        session.execute("吃什么.复制 早饭 " + args.slice(1).join(" "));
      if (args[0] === "菜单")
        session.execute("吃什么.查看 早饭" + args.slice(1).join(" "));
      if (args[0] === "清空")
        session.execute("吃什么.清空 早饭" + args.slice(1).join(" "));
      else session.execute("吃什么 breakfast");
    });
  ctx
    .command("吃什么.午饭", { hidden: true })
    .alias(".午餐", "午饭吃什么", "午饭吃啥", "吃什么午饭")
    .action(async ({ args, session }) => {
      if (args[0] === "添加")
        session.execute("吃什么.添加 午饭 " + args.slice(1).join(" "));
      else if (args[0] === "复制")
        session.execute("吃什么.复制 午饭 " + args.slice(1).join(" "));
      else if (args[0] === "菜单")
        session.execute("吃什么.查看 午饭" + args.slice(1).join(" "));
      else if (args[0] === "清空")
        session.execute("吃什么.清空 午饭" + args.slice(1).join(" "));
      else session.execute("吃什么 lunch");
    });
  ctx
    .command("吃什么.晚饭", { hidden: true })
    .alias(".晚餐", "晚饭吃什么", "晚饭吃啥", "吃什么晚饭")
    .action(async ({ args, session }) => {
      if (args[0] === "添加")
        session.execute("吃什么.添加 晚饭 " + args.slice(1).join(" "));
      else if (args[0] === "复制")
        session.execute("吃什么.复制 晚饭 " + args.slice(1).join(" "));
      else if (args[0] === "菜单")
        session.execute("吃什么.查看 晚饭" + args.slice(1).join(" "));
      else if (args[0] === "清空")
        session.execute("吃什么.清空 晚饭" + args.slice(1).join(" "));
      else session.execute("吃什么 dinner");
    });
  ctx
    .command("吃什么.零食", { hidden: true })
    .alias(".小吃", "吃什么零食")
    .action(async ({ args, session }) => {
      if (args[0] === "添加")
        session.execute("吃什么.添加 零食 " + args.slice(1).join(" "));
      if (args[0] === "复制")
        session.execute("吃什么.复制 零食 " + args.slice(1).join(" "));
      if (args[0] === "菜单")
        session.execute("吃什么.查看 零食" + args.slice(1).join(" "));
      if (args[0] === "清空")
        session.execute("吃什么.清空 零食" + args.slice(1).join(" "));
      else session.execute("吃什么 snacks");
    });
  ctx
    .command("吃什么.饮料", { hidden: true })
    .alias("喝啥", "喝什么", "喝什么饮料")
    .action(async ({ args, session }) => {
      if (args[0] === "添加")
        session.execute("吃什么.添加 饮料 " + args.slice(1).join(" "));
      if (args[0] === "复制")
        session.execute("吃什么.复制 饮料 " + args.slice(1).join(" "));
      if (args[0] === "菜单")
        session.execute("吃什么.查看 饮料" + args.slice(1).join(" "));
      if (args[0] === "清空")
        session.execute("吃什么.清空 饮料" + args.slice(1).join(" "));
      else session.execute("吃什么 drink");
    });

  ctx
    .command("吃什么.夜宵", { hidden: true })
    .alias(".宵夜", "夜宵吃什么", "夜宵吃啥", "吃什么夜宵")
    .action(async ({ args, session }) => {
      if (args[0] === "添加")
        session.execute("吃什么.添加 夜宵 " + args.slice(1).join(" "));
      if (args[0] === "复制")
        session.execute("吃什么.复制 夜宵 " + args.slice(1).join(" "));
      if (args[0] === "菜单")
        session.execute("吃什么.查看 夜宵" + args.slice(1).join(" "));
      if (args[0] === "清空")
        session.execute("吃什么.清空 夜宵" + args.slice(1).join(" "));
      else session.execute("吃什么 middlenight");
    });

  ctx.command("吃什么.添加").action(async ({ args, session }) => {
    const at =
      config.atTheUser && !session.event.channel.type
        ? h.at(session.userId) + " "
        : "";
    if (args.length === 0) {
      return (
        at +
        "指令格式：\n吃什么 添加 早饭/午饭/晚饭/零食/饮料/夜宵 食物名1 食物名2 ...\n可以在食物名后面加上(数字)表示权重如\n吃什么 添加 早饭 面包(2) 鸡蛋(1)"
      );
    } else if (foodTypes.includes(args[0] as foodType)) {
      if (args.length === 1) {
        return (
          at +
          "指令格式：\n吃什么 添加 早饭/午饭/晚饭/零食/饮料/夜宵 食物名1 食物名2 ...\n可以在食物名后面加上(数字)表示权重如\n吃什么 添加 早饭 面包(2) 鸡蛋(1)"
        );
      }
      //用户输入 食物1|食物2|食物3 格式
      if (args.length === 2 && args[1].includes("|")) {
        const foodNameArr = args[1].split("|");
        session.execute("吃什么 添加 " + args[0] + " " + foodNameArr.join(" "));
        return;
      }
      if (args.length === 2 && args[1].includes("，")) {
        const foodNameArr = args[1].split("，");
        session.execute("吃什么 添加 " + args[0] + " " + foodNameArr.join(" "));
        return;
      }
      if (args.length === 2 && args[1].includes(",")) {
        const foodNameArr = args[1].split(",");
        session.execute("吃什么 添加 " + args[0] + " " + foodNameArr.join(" "));
        return;
      }
      if (args.length === 2 && args[1].includes("、")) {
        const foodNameArr = args[1].split("、");
        session.execute("吃什么 添加 " + args[0] + " " + foodNameArr.join(" "));
        return;
      }
      const uid = session.uid;
      const foodType: foodType = args[0] as foodType;
      const foodMenu = new FoodMenu(
        await ctx.database.get("userFoodMenu", { uid, foodType })
      );
      let addWeigthList = {};
      try {
        addWeigthList = foodMenu.parseAndAdd(uid, foodType, ...args.slice(1));
      } catch (err) {
        return at + err.message;
      }
      await ctx.database.upsert("userFoodMenu", foodMenu.data);

      let returnMessage = at + `已添加${foodTypeText[foodType].name}菜单\n`;
      if (Object.keys(addWeigthList).length !== 0)
        returnMessage +=
          "以下食物权重增加：\n" +
          Object.keys(addWeigthList)
            .map((foodName) => foodName + "(" + addWeigthList[foodName] + ")")
            .join("，");
      returnMessage += await foodMenu.showSingleMenu(uid, foodType);
      return returnMessage;
    } else
      return (
        at +
        "指令格式：\n吃什么 添加 早饭/午饭/晚饭/零食/饮料/夜宵 食物名1 食物名2 ...\n可以在食物名后面加上(数字)表示权重如\n吃什么 添加 早饭 面包(2) 鸡蛋(1)"
      );
  });
  //用于注册子指令以及起别名
  ctx
    .command("吃什么.添加.早饭")
    .alias(".添加早餐", "添加早饭", "早饭添加")
    .action(async ({ args, session }) => {
      session.execute("吃什么 添加 breakfast " + args.join(" "));
    });
  ctx
    .command("吃什么.添加.午饭")
    .alias(".添加午餐", "添加午饭", "午饭添加")
    .action(async ({ args, session }) => {
      session.execute("吃什么 添加 lunch " + args.join(" "));
    });
  ctx
    .command("吃什么.添加.晚饭")
    .alias(".添加晚餐", "添加晚饭", "晚饭添加")
    .action(async ({ args, session }) => {
      session.execute("吃什么 添加 dinner " + args.join(" "));
    });
  ctx
    .command("吃什么.添加.零食")
    .alias("添加小吃", "零食添加")
    .action(async ({ args, session }) => {
      session.execute("吃什么 添加 snacks " + args.join(" "));
    });
  ctx
    .command("吃什么.添加.饮料")
    .alias(".添加喝的", "添加饮料", "饮料添加")
    .action(async ({ args, session }) => {
      session.execute("吃什么 添加 drink " + args.join(" "));
    });
  ctx
    .command("吃什么.添加.夜宵")
    .alias("添加宵夜", "夜宵添加")
    .action(async ({ args, session }) => {
      session.execute("吃什么 添加 middlenight " + args.join(" "));
    });

  ctx
    .command("吃什么.查看")
    .alias(".菜单")
    .action(async ({ args, session }) => {
      const at =
        config.atTheUser && !session.event.channel.type
          ? h.at(session.userId) + " "
          : "";
      const { uid } = session;
      const wrongCommandwarning =
        at +
        "指令格式：\n吃什么 查看\n吃什么 查看 早饭/午饭/晚饭/零食/饮料/夜宵\n吃什么 查看 @用户\n吃什么 查看 @用户 早饭/午饭/晚饭/零食/饮料/夜宵";
      if (args[0] === undefined) {
        if ((await ctx.database.get("userFoodMenu", { uid })).length === 0) {
          return (
            at +
            "你的菜单是空的，用指令\n吃什么.添加.早饭/午饭/晚饭/零食/饮料/夜宵 食物名1 食物名2 ...\n来添加菜单"
          );
        } else {
          return at + "你的菜单如下：" + (await new FoodMenu().showMenu(uid));
        }
      } else if (foodTypes.includes(args[0] as foodType)) {
        const foodType: foodType = args[0] as foodType;
        if (h.select(args[1], "at").length === 1) {
          session.execute("吃什么 查看 " + args[1] + " " + foodType);
        } else {
          const foodMenu = new FoodMenu(
            await ctx.database.get("userFoodMenu", { uid, foodType })
          );
          if (foodMenu.data.length === 0)
            return (
              at +
              `你的${foodTypeText[foodType].name}菜单是空的，用指令\n吃什么.添加.${foodTypeText[foodType].name} 食物名1 食物名2 ...\n来添加菜单`
            );
          else
            return (
              at + "菜单如下：" + (await foodMenu.showSingleMenu(uid, foodType))
            );
        }
      } else if (h.select(args[0], "at").length === 1) {
        const atId = h.select(args[0], "at")[0].attrs.id;
        if (args[1] === undefined) {
          if (atId === session.userId) {
            session.execute("吃什么.查看");
          } else if (atId === session.selfId) {
            return config.botMenuText;
          } else {
            if (
              (
                await ctx.database.get("userFoodMenu", {
                  uid: session.platform + ":" + atId,
                })
              ).length === 0
            ) {
              return "对方的菜单是空的...";
            } else
              return (
                "对方的菜单如下：" +
                (await new FoodMenu().showMenu(session.platform + ":" + atId))
              );
          }
        } else if (foodTypes.includes(args[1] as foodType)) {
          const foodType: foodType = args[1] as foodType;
          const foodMenu = new FoodMenu(
            await ctx.database.get("userFoodMenu", {
              uid: session.platform + ":" + atId,
              foodType,
            })
          );
          if (foodMenu.data.length === 0)
            return "对方的" + foodTypeText[foodType].name + "菜单是空的...";
          else
            return (
              "对方的" +
              foodTypeText[foodType].name +
              "菜单如下：" +
              (await foodMenu.showSingleMenu(
                session.platform + ":" + atId,
                foodType
              ))
            );
        } else if (args[1] === "早饭")
          session.execute("吃什么 查看 " + args[0] + " breakfast");
        else if (args[1] === "午饭")
          session.execute("吃什么 查看 " + args[0] + " lunch");
        else if (args[1] === "晚饭")
          session.execute("吃什么 查看 " + args[0] + " dinner");
        else if (args[1] === "零食")
          session.execute("吃什么 查看 " + args[0] + " snacks");
        else if (args[1] === "饮料")
          session.execute("吃什么 查看 " + args[0] + " drink");
        else if (args[1] === "夜宵")
          session.execute("吃什么 查看 " + args[0] + " middlenight");
        else return wrongCommandwarning;
      } else if (args[0] === "早饭")
        session.execute(
          "吃什么 查看 breakfast" + (args[1] === undefined ? "" : " " + args[1])
        );
      else if (args[0] === "午饭")
        session.execute(
          "吃什么 查看 lunch" + (args[1] === undefined ? "" : " " + args[1])
        );
      else if (args[0] === "晚饭")
        session.execute(
          "吃什么 查看 dinner" + (args[1] === undefined ? "" : " " + args[1])
        );
      else if (args[0] === "零食")
        session.execute(
          "吃什么 查看 snacks" + (args[1] === undefined ? "" : " " + args[1])
        );
      else if (args[0] === "饮料")
        session.execute(
          "吃什么 查看 drink" + (args[1] === undefined ? "" : " " + args[1])
        );
      else if (args[0] === "夜宵")
        session.execute(
          "吃什么 查看 middlenight" +
            (args[1] === undefined ? "" : " " + args[1])
        );
      else return wrongCommandwarning;
    });

  ctx
    .command("吃什么.删除")
    .alias(".删除")
    .action(async ({ args, session }) => {
      const { uid } = session;
      const at =
        config.atTheUser && !session.event.channel.type
          ? h.at(session.userId) + " "
          : "";
      if (args.length === 0)
        return at + "指令格式：\n吃什么 删除 食物名1 食物名2 ...";
      let returnMessage =
        config.atTheUser && !session.event.channel.type
          ? h.at(session.userId) + "\n"
          : "";
      if (foodTypes.includes(args[0] as foodType)) {
        const foodType: foodType = args[0] as foodType;
        returnMessage += `从你的${foodTypeText[foodType].name}菜单中删除：`;
        if (args.length === 1) {
          await ctx.database.remove("userFoodMenu", { uid, foodType });
          return at + `清空${foodTypeText[foodType].name}菜单成功！`;
        } else {
          args.slice(1).forEach(async (foodName) => {
            if (
              (await ctx.database.get("userFoodMenu", { uid, foodName }))
                .length === 0
            ) {
              returnMessage += `菜单中没有${foodName}，删除失败！\n`;
            } else {
              await ctx.database.remove("userFoodMenu", { uid, foodName });
              returnMessage += "删除" + foodName + "成功！\n";
            }
          });
          return (
            returnMessage +
            `你的${foodTypeText[foodType].name}菜单如下：` +
            (await new FoodMenu().showSingleMenu(uid, foodType))
          );
        }
      } else if (args[1] === "早饭")
        session.execute("吃什么 删除 breakfast " + args.slice(2).join(" "));
      else if (args[1] === "午饭")
        session.execute("吃什么 删除 lunch " + args.slice(2).join(" "));
      else if (args[1] === "晚饭")
        session.execute("吃什么 删除 dinner " + args.slice(2).join(" "));
      else if (args[1] === "零食")
        session.execute("吃什么 删除 snacks " + args.slice(2).join(" "));
      else if (args[1] === "饮料")
        session.execute("吃什么 删除 drink " + args.slice(2).join(" "));
      else {
        args.forEach(async (foodName) => {
          if (
            (await ctx.database.get("userFoodMenu", { uid, foodName }))
              .length === 0
          ) {
            returnMessage += "你的菜单中没有" + foodName + "，删除失败！\n";
          } else {
            await ctx.database.remove("userFoodMenu", { uid, foodName });
            returnMessage += "删除" + foodName + "成功！\n";
          }
        });
        return (
          returnMessage +
          "你的菜单如下：" +
          (await new FoodMenu().showMenu(uid))
        );
      }
    });

  ctx
    .command("吃什么.复制")
    .alias("拷贝", "copy")
    .action(async ({ args, session }) => {
      const at =
        config.atTheUser && !session.event.channel.type
          ? h.at(session.userId) + " "
          : "";
      const uid = session.uid;
      const wrongCommandwarning =
        at +
        "指令格式：\n吃什么 复制 @别人 \n或\n吃什么 复制 早饭/午饭/晚饭/零食/饮料/夜宵 @别人\n或\n吃什么 复制 早饭/午饭/晚饭/零食/饮料/夜宵 菜单名";
      if (args.length === 0) {
        return wrongCommandwarning;
      } else if (foodTypes.includes(args[0] as foodType)) {
        if (args[1] === undefined) {
          return wrongCommandwarning;
        } else {
          const foodType: foodType = args[0] as foodType;
          //吃什么.复制 菜单名 @某人 时
          if (h.select(args[1], "at").length === 1) {
            const targetUid =
              session.platform + ":" + h.select(args[1], "at")[0].attrs.id;
            const foodMenu = new FoodMenu(
              await ctx.database.get("userFoodMenu", {
                uid: targetUid,
                foodType,
              })
            );
            foodMenu.transUid(uid);
            await ctx.database.remove("userFoodMenu", { uid, foodType });
            await ctx.database.upsert("userFoodMenu", foodMenu.data);
            return (
              at +
              `从 ${args[1]} 复制${foodTypeText[foodType].name}菜单成功！` +
              `你的${foodTypeText[foodType].name}菜单如下：` +
              (await new FoodMenu().showSingleMenu(uid, foodType))
            );
          }
          //吃什么.复制 菜单名 菜单名 时
          else if (foodTypes.includes(args[1] as foodType)) {
            const targetFoodType: foodType = args[1] as foodType;
            const targetMenu = await new FoodMenu().showSingleMenu(
              uid,
              targetFoodType
            );
            session.send(
              `你确定要从${foodTypeText[targetFoodType].name}菜单复制到${foodTypeText[foodType].name}菜单吗？\n` +
                `你的${foodTypeText[foodType].name}菜单将会被覆盖！\n` +
                `请在15秒内输入“确定”以确认\n` +
                (targetMenu === ""
                  ? "你的" +
                    foodTypeText[targetFoodType].name +
                    "菜单是空的，确定要复制吗？"
                  : targetMenu) +
                "\n"
            );
            const confirm = await session.prompt(15000);
            if (confirm !== "确定") return at + "操作取消...";
            const foodMenu = new FoodMenu(
              await ctx.database.get("userFoodMenu", {
                uid,
                foodType: targetFoodType,
              })
            );
            foodMenu.transFoodType(foodType);
            await ctx.database.remove("userFoodMenu", { uid, foodType });
            await ctx.database.upsert("userFoodMenu", foodMenu.data);
            return (
              at +
              `从${foodTypeText[targetFoodType].name}菜单复制到${foodTypeText[foodType].name}菜单成功！` +
              `你的${foodTypeText[foodType].name}菜单如下：` +
              (await new FoodMenu().showSingleMenu(uid, foodType))
            );
          } else if (args[1] === "早饭")
            session.execute("吃什么 复制 " + foodType + " breakfast");
          else if (args[1] === "午饭")
            session.execute("吃什么 复制 " + foodType + " lunch");
          else if (args[1] === "晚饭")
            session.execute("吃什么 复制 " + foodType + " dinner");
          else if (args[1] === "零食")
            session.execute("吃什么 复制 " + foodType + " snacks");
          else if (args[1] === "饮料")
            session.execute("吃什么 复制 " + foodType + " drink");
          else if (args[1] === "夜宵")
            session.execute("吃什么 复制 " + foodType + " middlenight");
          else return wrongCommandwarning;
        }
      }
      //吃什么.复制 @某人 时
      else if (h.select(args[0], "at").length === 1) {
        if (args[1] === undefined) {
          const targetUid =
            session.platform + ":" + h.select(args[0], "at")[0].attrs.id;
          const foodMenu = new FoodMenu(
            await ctx.database.get("userFoodMenu", { uid: targetUid })
          );
          foodMenu.transUid(uid);
          await ctx.database.remove("userFoodMenu", { uid });
          await ctx.database.upsert("userFoodMenu", foodMenu.data);
          return (
            at +
            `从 ${args[0]} 复制菜单成功！` +
            `你的菜单如下：` +
            (await new FoodMenu().showMenu(uid))
          );
        } else if (foodTypes.includes(args[1] as foodType)) {
          session.execute("吃什么 复制 " + args[1] + " " + args[0]);
        } else if (args[1] === "早饭")
          session.execute("吃什么 复制 breakfast " + args[0]);
        else if (args[1] === "午饭")
          session.execute("吃什么 复制 lunch " + args[0]);
        else if (args[1] === "晚饭")
          session.execute("吃什么 复制 dinner " + args[0]);
        else if (args[1] === "零食")
          session.execute("吃什么 复制 snacks " + args[0]);
        else if (args[1] === "饮料")
          session.execute("吃什么 复制 drink " + args[0]);
        else if (args[1] === "夜宵")
          session.execute("吃什么 复制 middlenight " + args[0]);
      } else return wrongCommandwarning;
    });

  ctx
    .command("吃什么.复制.早饭")
    .alias(".复制早餐", "复制早饭", "早饭复制")
    .action(async ({ args, session }) => {
      session.execute("吃什么 复制 breakfast " + args.join(" "));
    });
  ctx
    .command("吃什么.复制.午饭")
    .alias(".复制午餐", "复制午饭", "午饭复制")
    .action(async ({ args, session }) => {
      session.execute("吃什么 复制 lunch " + args.join(" "));
    });
  ctx
    .command("吃什么.复制.晚饭")
    .alias(".复制晚餐", "复制晚饭", "晚饭复制")
    .action(async ({ args, session }) => {
      session.execute("吃什么 复制 dinner " + args.join(" "));
    });
  ctx
    .command("吃什么.复制.零食")
    .alias(".复制小吃", "复制零食", "零食复制")
    .action(async ({ args, session }) => {
      session.execute("吃什么 复制 snacks " + args.join(" "));
    });
  ctx
    .command("吃什么.复制.饮料")
    .alias(".复制喝的", "复制饮料", "饮料复制")
    .action(async ({ args, session }) => {
      session.execute("吃什么 复制 drink " + args.join(" "));
    });
  ctx
    .command("吃什么.复制.夜宵")
    .alias(".复制宵夜", "复制夜宵", "夜宵复制")
    .action(async ({ args, session }) => {
      session.execute("吃什么 复制 middlenight " + args.join(" "));
    });

  ctx.command("吃什么.清空").action(async ({ session }, message) => {
    const { uid } = session;
    const at =
      config.atTheUser && !session.event.channel.type
        ? h.at(session.userId) + " "
        : "";
    if (message === undefined) {
      session.send(
        at +
          "不输入菜单名会视为清空全部菜单，你确定要清空所有菜单吗？如果确认要这么做，请在十五秒内输入“确认”"
      );
      const confirm = await session.prompt(15000);
      if (confirm === "确认") {
        await ctx.database.remove("userFoodMenu", { uid });
        return at + "清空所有菜单成功！";
      } else {
        return at + "已取消清空";
      }
    } else if (foodTypes.includes(message as foodType)) {
      const foodType: foodType = message as foodType;
      await ctx.database.remove("userFoodMenu", { uid, foodType });
      return at + `清空${foodTypeText[foodType].name}菜单成功！`;
    } else if (message === "早饭") session.execute("吃什么 清空 breakfast");
    else if (message === "午饭") session.execute("吃什么 清空 lunch");
    else if (message === "晚饭") session.execute("吃什么 清空 dinner");
    else if (message === "零食") session.execute("吃什么 清空 snacks");
    else if (message === "饮料") session.execute("吃什么 清空 drink");
    else if (message === "夜宵") session.execute("吃什么 清空 middlenight");
    else
      return (
        at +
        "指令格式：\n吃什么 清空\n或\n吃什么 清空 早饭/午饭/晚饭/零食/饮料/夜宵"
      );
  });
}
