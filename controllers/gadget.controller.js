const Gadget = require("../models/Gadget");

const getAllGadgetBrands = async (req, res) => {
  /*
  if api call: /api/gadgets/brands (here, it will show 10 items)
  if api call: /api/gadgets/brands?page=all (here, it shows all items)
  if api call: /api/gadgets/brands?page=1&limit=5 (here, page=current page, limit=how many results will be displayed)
  if api call: /api/gadgets/brands?sort=count (here, results will be sorted by count of items per brand)
  */
  const page = req.query.page === "all" ? "all" : parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const sortByCount = req.query.sort === "count";

  try {
    let allBrands;
    if (sortByCount) {
      allBrands = await Gadget.aggregate([
        { $group: { _id: "$brand", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, brand: "$_id", count: 1 } },
      ]);
    } else {
      allBrands = await Gadget.aggregate([
        { $group: { _id: "$brand", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }, // Sort by the "_id" field in ascending order
        { $project: { _id: 0, brandName: "$_id", count: 1 } },
      ]);
    }

    const totalBrands = allBrands.length;
    const totalPages = Math.ceil(totalBrands / limit);

    let formattedBrands;
    if (page === "all") {
      formattedBrands = allBrands;
      res.json({
        status: true,
        brands: formattedBrands,
        total_count: totalBrands,
      });
    } else {
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const brandsToShow = allBrands.slice(startIndex, endIndex);
      formattedBrands = brandsToShow;

      res.json({
        status: true,
        brands: formattedBrands,
        total_count: totalBrands,
        total_pages: totalPages,
        current_page: page,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getGadgetByBrand = async (req, res) => {
  /* 
    if api call: /api/v1/gadgets?brandName=apple&page=1&limit=10 (here, brandName=brand name, page=current page, limit=how many results will be displayed)
    if api call: /api/v1/gadgets?gadget=all&page=1&limit=10 (here, phone=all means all phone will be displayed, page=current page, limit=how many results will be displayed)
  */
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const skip = (page - 1) * limit;

  const brandName = req.query.brandName;

  let filter = {};
  if (brandName) {
    // Use a case-insensitive regex for the brand field
    filter["brand"] = { $regex: new RegExp(brandName, "i") };
  }

  const totalCount = await Gadget.countDocuments(filter);

  const { parseISO, compareDesc } = require("date-fns");

  const data = await Gadget.find(filter).lean().exec();

  data.sort((a, b) => {
    const dateComparison = compareDesc(
      parseISO(a.LaunchAnnouncement),
      parseISO(b.LaunchAnnouncement)
    );
    if (dateComparison !== 0) {
      return dateComparison;
    }
    const categoryComparison = b.category - a.category;
    if (categoryComparison !== 0) {
      return categoryComparison;
    }
    return b._id - a._id;
  });

  // Calculate total number of pages
  const totalPages = Math.ceil(totalCount / limit);

  res.json({
    status: true,
    gadgets: data,
    total_count: totalCount,
    total_pages: totalPages,
    current_page: page,
  });
};

//get details
const getGadgetDetails = async (req, res) => {
  /* 
 /api/v1/gadgets/details?id=bl-bla-bla-ID = it will find from _id
  
  */
  const id = req.query.id.slice(-5);
  const pipeline = [
    {
      $addFields: {
        idString: { $toString: "$_id" },
        idStringLength: { $strLenBytes: { $toString: "$_id" } },
      },
    },
    {
      $addFields: {
        lastFiveBytes: {
          $subtract: [
            "$idStringLength",
            {
              $cond: {
                if: { $gt: ["$idStringLength", 5] },
                then: 5,
                else: "$idStringLength",
              },
            },
          ],
        },
      },
    },
    {
      $addFields: {
        lastFive: {
          $substrBytes: ["$idString", "$lastFiveBytes", 5],
        },
      },
    },
    {
      $match: { lastFive: id },
    },
    {
      $project: { idString: 0, lastFive: 0 },
    },
  ];

  const data = await Gadget.aggregate(pipeline);

  if (data.length > 0) {
    res.json({
      status: true,
      data: data,
    });
  } else {
    res.json({
      status: false,
      message: "data not found",
    });
  }
};

const searchGadgetByTitle = async (req, res) => {
  /*
  if api call: /api/v1/gadgets/search?keyword=apple (here, all apple devices will be shown)
  if api call: /api/v1/gadgets/search?keyword=apple&page=1&limit=10 (here, all apple devices will be shown but with pagination and, page=current page, limit=how many results will be displayed)
  if api call: /api/v1/gadgets/search?show=all&page=1&limit=10 (here, all Gadget devices will be shown but with pagination and, page=current page, limit=how many results will be displayed)
  */
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const skip = (page - 1) * limit;

  const keyword = req.query.keyword;

  const filter = {};
  if (req.query.show === "all") {
    // If the "show" query parameter is "all", don't apply any filters
  } else if (keyword) {
    filter["title"] = { $regex: keyword, $options: "i" };
  }

  const totalCount = await Gadget.countDocuments(filter);

  const data = await Gadget.find(filter)
    .skip(skip)
    .limit(limit)
    .sort({ _id: -1 });
  // Calculate total number of pages
  const totalPages = Math.ceil(totalCount / limit);
  if (totalCount) {
    res.json({
      status: true,
      data: data,
      total_count: totalCount,
      total_pages: totalPages,
      current_page: page,
    });
  } else {
    {
      res.json({
        status: false,
        message: "No results found",
      });
    }
  }
};
const getFilteredGadgetsByCategory = async (req, res) => {
  /*
  if api call: /api/gadgets?show=smartPhone&page=1&limit=5 (here, page=current page, limit=how many results will be displayed)
  show's value: smartPhone, smartWatch, all
  */
  const category = req.query.show;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    let query = {};
    if (category === "smartWatch") {
      query = { category: "Smart Watch" };
    } else if (category === "smartPhone") {
      query = { category: "Smartphone" };
    }

    const { parseISO, compareDesc } = require("date-fns");

    const allGadgets = await Gadget.aggregate([
      { $match: query },
      {
        $addFields: {
          maxDate: {
            $max: [
              "$specifications.LaunchAnnouncement",
              parseISO("$specifications.LaunchAnnouncement"),
              parseISO("01-$specifications.LaunchAnnouncement"),
            ],
          },
        },
      },
      { $sort: { maxDate: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    const totalGadgets = await Gadget.countDocuments(query);
    const totalPages = Math.ceil(totalGadgets / limit);

    res.json({
      status: true,
      gadgets: allGadgets,
      total_count: totalGadgets,
      total_pages: totalPages,
      current_page: page,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllGadgetBrands,
  getGadgetByBrand,
  getGadgetDetails,
  searchGadgetByTitle,
  getFilteredGadgetsByCategory,
};
